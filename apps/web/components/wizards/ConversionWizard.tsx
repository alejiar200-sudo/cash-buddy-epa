import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { useStore } from "@/lib/store";
import { Avatar } from "../Avatar";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; date: string; }

type Direction = "cash-to-bank" | "bank-to-cash";

export function ConversionWizard({ open, onOpenChange, date }: Props) {
  const { state, addMovement, ensureDay } = useStore();
  const [step, setStep] = useState(1);
  const [workerId, setWorkerId] = useState<string | undefined>();
  const [freeText, setFreeText] = useState("");
  const [direction, setDirection] = useState<Direction | null>(null);
  const [amount, setAmount] = useState(0);

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1); setWorkerId(undefined); setFreeText("");
      setDirection(null); setAmount(0);
    }, 250);
  }

  async function submit() {
    if (!direction || amount <= 0) return;
    await ensureDay(date);
    const who = workerId ? state.workers.find(w => w.id === workerId)?.name : freeText || "Cliente";
    if (direction === "cash-to-bank") {
      // Sale efectivo (cat 9), entra al banco (cat 10)
      await addMovement(date, { category: 9, type: "egreso", medium: "cash", amount, workerId, description: `Conv efectivo→banco: ${who}` });
      await addMovement(date, { category: 10, type: "ingreso", medium: "bank", amount, workerId, description: `Conv efectivo→banco: ${who}` });
    } else {
      // Sale del banco (cat 8), entra efectivo (cat 7)
      await addMovement(date, { category: 8, type: "egreso", medium: "bank", amount, workerId, description: `Conv banco→efectivo: ${who}` });
      await addMovement(date, { category: 7, type: "ingreso", medium: "cash", amount, workerId, description: `Conv banco→efectivo: ${who}` });
    }
    toast.success(`🔄 Conversión registrada (${direction === "cash-to-bank" ? "efectivo → banco" : "banco → efectivo"})`);
    close();
  }

  return (
    <WizardShell
      open={open} onOpenChange={(v) => { if (!v) close(); }} step={step} total={4}
      title={
        step === 1 ? "¿De quién es esta transferencia?"
        : step === 2 ? "¿En qué dirección va el dinero?"
        : step === 3 ? "¿Cuánto fue la transferencia?"
        : "Resumen"
      }
      subtitle={
        step === 1 ? "💡 Usa esto cuando necesites mover dinero entre efectivo y banco"
        : step === 2 ? "Elige el sentido: lo que sale y lo que entra"
        : undefined
      }
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
    >
      {step === 1 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
            {state.workers.filter(w => w.active).map(w => (
              <button key={w.id} onClick={() => { setWorkerId(w.id); setStep(2); }} className={`flex items-center gap-2 p-2 rounded-xl glass text-left ${workerId === w.id ? "ring-cash" : ""}`}>
                <Avatar worker={w} size={28} />
                <span className="text-sm font-medium">{w.name}</span>
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground text-center">o escribe el nombre</div>
          <input value={freeText} onChange={(e) => { setFreeText(e.target.value); setWorkerId(undefined); }} placeholder="Nombre del cliente…" className="w-full glass rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40" />
          <button disabled={!workerId && !freeText.trim()} onClick={() => setStep(2)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">Siguiente →</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <button
            onClick={() => { setDirection("cash-to-bank"); setStep(3); }}
            className={`w-full p-5 rounded-2xl border-2 transition flex items-center gap-4 text-left ${direction === "cash-to-bank" ? "border-primary bg-cash-soft" : "border-border glass hover:border-primary/50"}`}
          >
            <div className="text-3xl">💵 → 🏦</div>
            <div>
              <div className="font-bold">Efectivo → Banco</div>
              <div className="text-xs text-muted-foreground mt-0.5">Cliente paga por transferencia, sale efectivo de caja</div>
            </div>
          </button>
          <button
            onClick={() => { setDirection("bank-to-cash"); setStep(3); }}
            className={`w-full p-5 rounded-2xl border-2 transition flex items-center gap-4 text-left ${direction === "bank-to-cash" ? "border-accent bg-bank-soft" : "border-border glass hover:border-accent/50"}`}
          >
            <div className="text-3xl">🏦 → 💵</div>
            <div>
              <div className="font-bold">Banco → Efectivo</div>
              <div className="text-xs text-muted-foreground mt-0.5">Sacas del banco para tener más efectivo en caja</div>
            </div>
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
          <button disabled={amount <= 0} onClick={() => setStep(4)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">Siguiente →</button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="glass-strong rounded-2xl p-5 space-y-2 tnum">
            {direction === "cash-to-bank" ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground text-sm">Salida de efectivo</span><span className="text-danger font-bold">-{formatCOP(amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-sm">Ingreso al banco</span><span className="text-bank font-bold">+{formatCOP(amount)}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground text-sm">Salida del banco</span><span className="text-danger font-bold">-{formatCOP(amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-sm">Ingreso a efectivo</span><span className="text-cash font-bold">+{formatCOP(amount)}</span></div>
              </>
            )}
          </div>
          <button onClick={submit} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">¿Todo bien? — Confirmar</button>
        </div>
      )}
    </WizardShell>
  );
}
