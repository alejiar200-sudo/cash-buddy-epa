import { useState } from "react";
import { useStore } from "@/lib/store";
import { WizardShell } from "./WizardShell";
import { Avatar } from "../Avatar";
import { MoneyInput } from "../MoneyInput";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";
import { Mailbox, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  workerId: string;
}

type HeldBy = "courier" | "admin";

export function RegisterDeliveryWizard({ open, onOpenChange, date, workerId }: Props) {
  const { state, addMovement, ensureDay } = useStore();
  const worker = state.workers.find((w) => w.id === workerId);
  const pct = state.settings.commissionPercent ?? 0;

  const [step, setStep] = useState(1);
  const [value, setValue] = useState(0);
  const [held, setHeld] = useState<HeldBy | null>(null);

  const commission = Math.round(value * (pct / 100));
  const company = value - commission;

  function reset() { setStep(1); setValue(0); setHeld(null); }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  function submit() {
    if (!worker || value <= 0 || !held) return;
    ensureDay(date);
    // 1) Delivery movement (cat 1 = cash deliveries by default; status depends on held)
    const delivery = addMovement(date, {
      category: 1,
      type: "ingreso",
      medium: "cash",
      amount: value,
      workerId,
      description: `Domicilio - ${worker.name}`,
      status: held === "admin" ? "confirmed" : "pending",
      kind: "delivery",
    });
    // 2) Commission (always pending in nómina, regardless of delivery received)
    if (commission > 0) {
      addMovement(date, {
        category: 15, // default cash; medium is reassigned on payment
        type: "egreso",
        medium: "cash",
        amount: commission,
        workerId,
        description: `Comisión domicilio - ${worker.name}`,
        status: "pending",
        kind: "commission",
        deliveryId: delivery.id,
        deliveryValue: value,
      });
    }
    toast.success(
      held === "admin"
        ? `✅ Domicilio recibido (${formatCOP(value)})`
        : `⚠️ Domicilio registrado — ${worker.name} debe ${formatCOP(value)}`
    );
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
        step === 1 ? `Domicilio de ${worker.name.toUpperCase()}`
        : step === 2 ? "¿Quién tiene el dinero ahora?"
        : "Resumen del domicilio"
      }
      subtitle={
        step === 1 ? "¿Cuánto vale el domicilio que vas a registrar?"
        : undefined
      }
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
    >
      <div className="flex items-center gap-3 p-3 glass rounded-2xl mb-5">
        <Avatar worker={worker} />
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Domiciliario</div>
          <div className="font-bold">{worker.name}</div>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <MoneyInput value={value} onChange={setValue} autoFocus />
          {value > 0 && pct > 0 && (
            <div className="space-y-2 animate-slide-in">
              <div className="p-3 rounded-2xl bg-cash-soft text-cash flex items-center justify-between">
                <span>💰 Comisión de {worker.name} ({pct}%)</span>
                <span className="font-black tnum">{formatCOP(commission)}</span>
              </div>
              <div className="p-3 rounded-2xl bg-bank-soft text-bank flex items-center justify-between">
                <span>🏢 Para la empresa</span>
                <span className="font-black tnum">{formatCOP(company)}</span>
              </div>
            </div>
          )}
          <button onClick={() => setStep(2)} disabled={value <= 0} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">
            Siguiente →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => { setHeld("courier"); setStep(3); }}
              className={`p-5 rounded-2xl border-2 transition flex items-center gap-4 text-left ${held === "courier" ? "border-danger bg-danger-soft" : "border-border glass hover:border-danger/50"}`}
            >
              <Mailbox className="h-8 w-8 text-danger" />
              <div>
                <div className="font-bold">📬 Aún lo tiene él/ella</div>
                <div className="text-xs text-muted-foreground mt-0.5">{worker.name} lo debe — no entra a caja todavía</div>
              </div>
            </button>
            <button
              onClick={() => { setHeld("admin"); setStep(3); }}
              className={`p-5 rounded-2xl border-2 transition flex items-center gap-4 text-left ${held === "admin" ? "border-cash bg-cash-soft" : "border-border glass hover:border-cash/50"}`}
            >
              <CheckCircle2 className="h-8 w-8 text-cash" />
              <div>
                <div className="font-bold">✅ Ya me lo entregó</div>
                <div className="text-xs text-muted-foreground mt-0.5">Tengo el dinero — entra a caja ahora</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="glass-strong rounded-2xl p-5 space-y-2 tnum">
            <Row label="📦 Valor domicilio" value={formatCOP(value)} />
            <Row
              label={held === "admin" ? "🏢 Entra a caja" : "🏢 Pendiente entrar"}
              value={formatCOP(value)}
              color={held === "admin" ? "text-cash" : "text-warn"}
            />
            {commission > 0 && (
              <Row label={`🛵 Comisión ${worker.name} (${pct}%)`} value={formatCOP(commission)} color="text-primary" />
            )}
            <div className="border-t border-border my-2" />
            <div className="text-sm text-center font-medium">
              Estado: {held === "admin"
                ? <span className="text-cash">✅ Recibido</span>
                : <span className="text-warn">⚠️ Pendiente — {worker.name} lo debe</span>}
            </div>
            {commission > 0 && (
              <div className="text-xs text-center text-muted-foreground">
                La comisión se agregó a la nómina pendiente.
              </div>
            )}
          </div>
          <button onClick={submit} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">
            ✅ Confirmar
          </button>
        </div>
      )}
    </WizardShell>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-bold ${color ?? "text-foreground"} tnum`}>{value}</span>
    </div>
  );
}
