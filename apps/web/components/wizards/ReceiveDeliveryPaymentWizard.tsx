import { useState } from "react";
import { useStore, deliveriesForDay } from "@/lib/store";
import { WizardShell } from "./WizardShell";
import { Avatar } from "../Avatar";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  workerId: string;
  presetDeliveryId?: string;
}

export function ReceiveDeliveryPaymentWizard({ open, onOpenChange, date, workerId, presetDeliveryId }: Props) {
  const { state, getDay, updateMovement } = useStore();
  const worker = state.workers.find((w) => w.id === workerId);
  const day = getDay(date);
  const all = deliveriesForDay(day, workerId);
  const pending = all.filter((d) => !d.received);

  const [selected, setSelected] = useState<Set<string>>(
    () => presetDeliveryId ? new Set([presetDeliveryId]) : new Set()
  );
  const [medium, setMedium] = useState<"cash" | "bank" | null>(null);

  function toggle(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }

  const total = pending
    .filter((d) => selected.has(d.movement.id))
    .reduce((s, d) => s + d.value, 0);

  function reset() {
    setSelected(presetDeliveryId ? new Set([presetDeliveryId]) : new Set());
    setMedium(null);
  }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit() {
    if (!medium || total <= 0) return;
    for (const d of pending) {
      if (!selected.has(d.movement.id)) continue;
      await updateMovement(date, d.movement.id, {
        status: "confirmed",
        medium,
        category: medium === "cash" ? 1 : 2,
      });
    }
    toast.success(`✅ Recibido ${formatCOP(total)} de ${worker?.name}`);
    close();
  }

  if (!worker) return null;

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={1}
      total={1}
      title={`💵 Recibir pago — ${worker.name.toUpperCase()}`}
      subtitle="Selecciona los domicilios que estás recibiendo ahora"
    >
      <div className="flex items-center gap-3 p-3 glass rounded-2xl mb-4">
        <Avatar worker={worker} />
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Domicilios pendientes</div>
          <div className="font-bold">{pending.length}</div>
        </div>
        {pending.length > 0 && (
          <button
            onClick={() => setSelected(new Set(pending.map((d) => d.movement.id)))}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-secondary"
          >
            Seleccionar todos
          </button>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">No hay domicilios pendientes 🎉</div>
      ) : (
        <>
          <div className="space-y-1.5 max-h-60 overflow-auto pr-1">
            {pending.map((d) => {
              const checked = selected.has(d.movement.id);
              return (
                <button
                  key={d.movement.id}
                  onClick={() => toggle(d.movement.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition ${checked ? "border-cash bg-cash-soft" : "border-border glass"}`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${checked ? "bg-cash border-cash" : "border-muted-foreground"}`}>
                    {checked && <span className="text-background text-xs font-black">✓</span>}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold tnum">{formatCOP(d.value)}</div>
                    <div className="text-xs text-muted-foreground">{d.movement.time} · ⚠️ Debe</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 p-3 rounded-xl glass-strong flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total seleccionado</span>
            <span className="text-xl font-black tnum text-cash">{formatCOP(total)}</span>
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">¿Cómo te pagó?</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMedium("cash")}
                className={`p-4 rounded-2xl border-2 font-bold ${medium === "cash" ? "border-primary bg-cash-soft text-cash" : "border-border glass"}`}
              >
                💵 Efectivo
              </button>
              <button
                onClick={() => setMedium("bank")}
                className={`p-4 rounded-2xl border-2 font-bold ${medium === "bank" ? "border-accent bg-bank-soft text-bank" : "border-border glass"}`}
              >
                🏦 Banco
              </button>
            </div>
          </div>

          <button
            disabled={!medium || total <= 0}
            onClick={submit}
            className="mt-4 w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            ✅ Confirmar pago de {formatCOP(total)}
          </button>
        </>
      )}
    </WizardShell>
  );
}
