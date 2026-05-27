import { useState } from "react";
import { useStore } from "@/lib/store";
import { WizardShell } from "./WizardShell";
import { Avatar } from "../Avatar";
import { MoneyInput } from "../MoneyInput";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  workerId: string;
}

export function RegisterDeliveriesWizard({ open, onOpenChange, date, workerId }: Props) {
  const { state, addMovement, ensureDay, getDay } = useStore();
  const worker = state.workers.find((w) => w.id === workerId);
  const day = getDay(date);
  const baseGiven = day.movements
    .filter((m) => m.workerId === workerId && m.category === 5 && m.type === "egreso")
    .reduce((s, m) => s + m.amount, 0);

  const [step, setStep] = useState(1);
  const [cash, setCash] = useState(0);
  const [hasBank, setHasBank] = useState<boolean | null>(null);
  const [bank, setBank] = useState(0);

  function reset() { setStep(1); setCash(0); setHasBank(null); setBank(0); }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit() {
    if (!worker) return;
    await ensureDay(date);
    if (cash > 0) {
      await addMovement(date, { category: 1, type: "ingreso", medium: "cash", amount: cash, workerId, description: `Domicilios efectivo - ${worker.name}`, status: "pending" });
    }
    if (bank > 0) {
      await addMovement(date, { category: 2, type: "ingreso", medium: "bank", amount: bank, workerId, description: `Domicilios banco - ${worker.name}`, status: "pending" });
    }
    toast.success("📌 Domicilios registrados como pendientes");
    close();
  }

  if (!worker) return null;

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={3}
      title={
        step === 1
          ? `Domicilios de ${worker.name} — ¿cuánto en efectivo?`
          : step === 2
          ? "¿Hubo pagos por banco o transferencia?"
          : `Resumen de ${worker.name}`
      }
      subtitle={
        step === 1
          ? "💡 Escribe el total en efectivo que va a entregarte por sus domicilios de hoy"
          : undefined
      }
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
    >
      <div className="flex items-center gap-3 p-3 glass rounded-2xl mb-5">
        <Avatar worker={worker} />
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Base entregada hoy</div>
          <div className="font-bold tnum">{formatCOP(baseGiven)}</div>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <MoneyInput value={cash} onChange={setCash} autoFocus />
          <button onClick={() => setStep(2)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash hover:scale-[1.01] transition">
            Siguiente →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setHasBank(true); }}
              className={`p-5 rounded-2xl border-2 transition ${hasBank === true ? "border-bank bg-bank-soft" : "border-border glass hover:border-accent/50"}`}
            >
              <div className="text-3xl">🏦</div>
              <div className="font-bold mt-1">Sí, hubo banco</div>
            </button>
            <button
              onClick={() => { setHasBank(false); setBank(0); setStep(3); }}
              className={`p-5 rounded-2xl border-2 transition ${hasBank === false ? "border-primary bg-cash-soft" : "border-border glass hover:border-primary/50"}`}
            >
              <div className="text-3xl">💵</div>
              <div className="font-bold mt-1">No, todo efectivo</div>
            </button>
          </div>
          {hasBank && (
            <div className="space-y-3 animate-slide-in">
              <div className="text-sm text-muted-foreground">¿Cuánto recibió la empresa por banco?</div>
              <MoneyInput value={bank} onChange={setBank} autoFocus />
              <button onClick={() => setStep(3)} className="w-full bg-accent text-accent-foreground font-bold py-4 rounded-2xl shadow-bank">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="glass-strong rounded-2xl p-5 space-y-2 tnum">
            <Row label="💵 Domicilios efectivo" value={formatCOP(cash)} color="text-cash" />
            <Row label="🏦 Domicilios banco" value={formatCOP(bank)} color="text-bank" />
            <Row label="➕ Base entregada" value={formatCOP(baseGiven)} color="text-foreground" />
            <div className="border-t border-border my-2" />
            <Row label="📌 Total a devolver" value={formatCOP(baseGiven + cash + bank)} color="text-foreground" big />
          </div>
          <div className="p-3 rounded-xl bg-warn-soft text-warn text-sm text-center font-medium">
            ⏳ Estado: pendiente hasta que lo entregue
          </div>
          <button onClick={submit} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">
            ✅ Confirmar — queda pendiente
          </button>
        </div>
      )}
    </WizardShell>
  );
}

function Row({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={big ? "font-bold" : "text-muted-foreground text-sm"}>{label}</span>
      <span className={`${color} ${big ? "text-xl font-black" : "font-bold"} tnum`}>{value}</span>
    </div>
  );
}
