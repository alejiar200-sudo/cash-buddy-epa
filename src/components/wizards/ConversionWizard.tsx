import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { useStore } from "@/lib/store";
import { Avatar } from "../Avatar";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; date: string; }

export function ConversionWizard({ open, onOpenChange, date }: Props) {
  const { state, addMovement, ensureDay } = useStore();
  const [step, setStep] = useState(1);
  const [workerId, setWorkerId] = useState<string | undefined>();
  const [freeText, setFreeText] = useState("");
  const [amount, setAmount] = useState(0);

  function close() { onOpenChange(false); setTimeout(() => { setStep(1); setWorkerId(undefined); setFreeText(""); setAmount(0); }, 250); }

  function submit() {
    ensureDay(date);
    const who = workerId ? state.workers.find(w => w.id === workerId)?.name : freeText || "Cliente";
    addMovement(date, { category: 9, type: "egreso", medium: "cash", amount, workerId, description: `Conv: ${who}` });
    addMovement(date, { category: 10, type: "ingreso", medium: "bank", amount, workerId, description: `Conv: ${who}` });
    toast.success("🔄 Conversión registrada");
    close();
  }

  return (
    <WizardShell
      open={open} onOpenChange={(v) => { if (!v) close(); }} step={step} total={3}
      title={step === 1 ? "¿De quién es esta transferencia?" : step === 2 ? "¿Cuánto fue la transferencia?" : "Resumen"}
      subtitle={step === 1 ? "💡 Usa esto cuando un cliente pagó por transferencia y necesitas reflejar ese dinero correctamente" : undefined}
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
        <div className="space-y-4">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
          <button disabled={amount <= 0} onClick={() => setStep(3)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">Siguiente →</button>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <div className="glass-strong rounded-2xl p-5 space-y-2 tnum">
            <div className="flex justify-between"><span className="text-muted-foreground text-sm">Salida de efectivo</span><span className="text-danger font-bold">-{formatCOP(amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground text-sm">Ingreso al banco</span><span className="text-bank font-bold">+{formatCOP(amount)}</span></div>
          </div>
          <button onClick={submit} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">¿Todo bien? — Confirmar</button>
        </div>
      )}
    </WizardShell>
  );
}
