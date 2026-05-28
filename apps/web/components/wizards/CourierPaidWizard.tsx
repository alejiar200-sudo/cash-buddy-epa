import { useState } from "react";
import { useStore, courierStatusForDay } from "@/lib/store";
import { WizardShell } from "./WizardShell";
import { Avatar } from "../Avatar";
import { MoneyInput } from "../MoneyInput";
import { formatCOP } from "@/lib/format";
import { CheckCircle2, AlertTriangle, PartyPopper } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  workerId: string;
}

export function CourierPaidWizard({ open, onOpenChange, date, workerId }: Props) {
  const { state, getDay, addMovement, updateMovement } = useStore();
  const worker = state.workers.find((w) => w.id === workerId);
  const day = getDay(date);
  const status = courierStatusForDay(day, workerId);
  const owedTotal = status.totalOwed - status.totalReturned;

  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(0);
  const [baseMedium, setBaseMedium] = useState<"cash" | "bank" | null>(null);
  const pendingBase = Math.max(0, status.baseGiven - status.baseReturned);

  function reset() { setStep(1); setAmount(0); setBaseMedium(null); }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit() {
    if (!worker) return;
    // 1. Confirm pending deliveries (mark all as confirmed regardless — simpler for v1)
    const pendings = day.movements.filter((m) => m.workerId === workerId && (m.category === 1 || m.category === 2) && m.status === "pending");
    for (const m of pendings) {
      await updateMovement(date, m.id, { status: "confirmed" });
    }

    // 2. Register base return en el medio elegido (cat 5 efectivo / cat 6 banco)
    const baseToReturn = Math.min(amount, pendingBase);
    if (baseToReturn > 0 && baseMedium) {
      await addMovement(date, {
        category: baseMedium === "cash" ? 5 : 6,
        type: "ingreso",
        medium: baseMedium,
        amount: baseToReturn,
        workerId,
        description: `Devolución base (${baseMedium === "cash" ? "efectivo" : "banco"}) - ${worker.name}`,
        status: "confirmed",
      });
    }
    toast.success(`✅ Registrado pago de ${worker.name}`);
    close();
  }

  if (!worker) return null;

  const diff = amount - owedTotal;

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={2}
      title={step === 1 ? `¿Cuánto te está entregando ${worker.name}?` : "Resultado"}
      onBack={step === 2 ? () => setStep(1) : undefined}
    >
      <div className="flex items-center gap-3 p-3 glass rounded-2xl mb-4">
        <Avatar worker={worker} />
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">{worker.name} debe devolver</div>
          <div className="font-black text-xl tnum">{formatCOP(owedTotal)}</div>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-4 text-sm space-y-1.5 tnum">
            <div className="flex justify-between"><span className="text-muted-foreground">Base pendiente</span><span>{formatCOP(status.baseGiven - status.baseReturned)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Domicilios efectivo</span><span>{formatCOP(status.deliveriesCashPending + (status.deliveriesCashConfirmed))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Domicilios banco</span><span>{formatCOP(status.deliveriesBankPending + status.deliveriesBankConfirmed)}</span></div>
          </div>

          <MoneyInput value={amount} onChange={setAmount} autoFocus />

          <button onClick={() => setAmount(owedTotal)} className="w-full py-3 rounded-xl bg-cash-soft text-cash font-bold ring-cash">
            Todo — {formatCOP(owedTotal)}
          </button>

          {pendingBase > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">¿En qué medio te devuelve la base?</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBaseMedium("cash")}
                  className={`p-3 rounded-2xl border-2 font-bold transition ${baseMedium === "cash" ? "border-primary bg-cash-soft text-cash" : "border-border glass hover:border-primary/50"}`}
                >
                  💵 Efectivo
                </button>
                <button
                  onClick={() => setBaseMedium("bank")}
                  className={`p-3 rounded-2xl border-2 font-bold transition ${baseMedium === "bank" ? "border-accent bg-bank-soft text-bank" : "border-border glass hover:border-accent/50"}`}
                >
                  🏦 Banco
                </button>
              </div>
            </div>
          )}

          <button onClick={() => setStep(2)} disabled={amount <= 0 || (pendingBase > 0 && !baseMedium)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">
            Siguiente →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {diff === 0 && (
            <div className="text-center p-6 rounded-3xl bg-cash-soft ring-cash animate-pop">
              <PartyPopper className="h-16 w-16 mx-auto text-cash" />
              <div className="text-2xl font-black mt-3 text-cash">¡Todo bien!</div>
              <div className="text-sm mt-1">{worker.name} quedó al día</div>
            </div>
          )}
          {diff < 0 && (
            <div className="text-center p-6 rounded-3xl bg-warn-soft text-warn animate-pop">
              <AlertTriangle className="h-12 w-12 mx-auto" />
              <div className="text-xl font-bold mt-2">Falta {formatCOP(-diff)}</div>
              <div className="text-sm mt-1 text-muted-foreground">Confirmaremos lo entregado y el resto quedará pendiente</div>
            </div>
          )}
          {diff > 0 && (
            <div className="text-center p-6 rounded-3xl bg-bank-soft text-bank animate-pop">
              <CheckCircle2 className="h-12 w-12 mx-auto" />
              <div className="text-xl font-bold mt-2">Dio {formatCOP(diff)} de más</div>
              <div className="text-sm mt-1 text-muted-foreground">Se guardará como anticipo</div>
            </div>
          )}
          <button onClick={submit} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">
            ✅ Confirmar pago
          </button>
        </div>
      )}
    </WizardShell>
  );
}
