import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { todayBogota } from "@/lib/format";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; date: string; }

export function ExpenseWizard({ open, onOpenChange, date }: Props) {
  const { addMovement, ensureDay } = useStore();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [step, setStep] = useState(1);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState(0);
  const [expenseDate, setExpenseDate] = useState(date);
  const [medium, setMedium] = useState<"cash" | "bank" | null>(null);

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1); setDesc(""); setAmount(0); setMedium(null); setExpenseDate(date);
    }, 250);
  }

  function submit(m: "cash" | "bank") {
    ensureDay(expenseDate);
    // Admin → confirmado al instante. No-admin → pendiente de aprobación.
    addMovement(expenseDate, {
      category: m === "cash" ? 3 : 4,
      type: "egreso",
      medium: m,
      amount,
      description: desc,
      status: isAdmin ? "confirmed" : "pending",
      createdBy: user?.id,
    } as Parameters<typeof addMovement>[1]);
    toast.success(isAdmin
      ? `✅ Gasto registrado: ${desc}`
      : `📋 Gasto enviado para aprobación: ${desc}`);
    close();
  }

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={3}
      title={
        step === 1 ? "¿En qué gastó la empresa?" :
        step === 2 ? "Valor y fecha del gasto" :
        "¿De dónde sale el dinero?"
      }
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
    >
      {step === 1 && (
        <div className="space-y-3">
          <input
            autoFocus
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && desc.trim()) setStep(2); }}
            placeholder="Ej: Gasolina, repuestos, arriendo…"
            className="w-full glass-strong rounded-2xl px-5 py-4 text-lg outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            disabled={!desc.trim()}
            onClick={() => setStep(2)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
          <div>
            <label className="text-xs text-muted-foreground font-medium">Fecha del gasto</label>
            <input
              type="date"
              value={expenseDate}
              max={todayBogota()}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full mt-1 glass rounded-2xl px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            disabled={amount <= 0}
            onClick={() => setStep(3)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setMedium("cash"); submit("cash"); }}
            className={`p-6 rounded-2xl border-2 transition ${medium === "cash" ? "border-primary" : "border-border"} glass hover:ring-cash`}
          >
            <div className="text-4xl">💵</div>
            <div className="font-bold mt-2">Efectivo</div>
          </button>
          <button
            onClick={() => { setMedium("bank"); submit("bank"); }}
            className={`p-6 rounded-2xl border-2 transition ${medium === "bank" ? "border-accent" : "border-border"} glass hover:ring-bank`}
          >
            <div className="text-4xl">🏦</div>
            <div className="font-bold mt-2">Banco</div>
          </button>
        </div>
      )}
    </WizardShell>
  );
}
