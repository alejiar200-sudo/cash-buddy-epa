import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; date: string; }

export function ExpenseWizard({ open, onOpenChange, date }: Props) {
  const { addMovement, ensureDay } = useStore();
  const [step, setStep] = useState(1);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState(0);
  const [medium, setMedium] = useState<"cash" | "bank" | null>(null);

  function close() { onOpenChange(false); setTimeout(() => { setStep(1); setDesc(""); setAmount(0); setMedium(null); }, 250); }

  function submit(m: "cash" | "bank") {
    ensureDay(date);
    addMovement(date, { category: m === "cash" ? 3 : 4, type: "egreso", medium: m, amount, description: desc });
    toast.success(`✅ Gasto registrado: ${desc}`);
    close();
  }

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={3}
      title={step === 1 ? "¿En qué gastó la empresa?" : step === 2 ? "¿Cuánto fue el gasto?" : "¿De dónde sale el dinero?"}
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
    >
      {step === 1 && (
        <div className="space-y-3">
          <input autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: Gasolina, repuestos…" className="w-full glass-strong rounded-2xl px-5 py-4 text-lg outline-none focus:ring-2 focus:ring-primary/40" />
          <button disabled={!desc.trim()} onClick={() => setStep(2)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">Siguiente →</button>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
          <button disabled={amount <= 0} onClick={() => setStep(3)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">Siguiente →</button>
        </div>
      )}
      {step === 3 && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setMedium("cash"); submit("cash"); }} className={`p-6 rounded-2xl border-2 transition ${medium === "cash" ? "border-primary" : "border-border"} glass hover:ring-cash`}>
            <div className="text-4xl">💵</div>
            <div className="font-bold mt-2">Efectivo</div>
          </button>
          <button onClick={() => { setMedium("bank"); submit("bank"); }} className={`p-6 rounded-2xl border-2 transition ${medium === "bank" ? "border-accent" : "border-border"} glass hover:ring-bank`}>
            <div className="text-4xl">🏦</div>
            <div className="font-bold mt-2">Banco</div>
          </button>
        </div>
      )}
    </WizardShell>
  );
}
