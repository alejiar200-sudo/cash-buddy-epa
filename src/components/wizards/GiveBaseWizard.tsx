import { useState } from "react";
import { useStore, type Worker } from "@/lib/store";
import { WizardShell } from "./WizardShell";
import { Avatar } from "../Avatar";
import { MoneyInput } from "../MoneyInput";
import { Check, Banknote } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  presetWorkerId?: string;
}

export function GiveBaseWizard({ open, onOpenChange, date, presetWorkerId }: Props) {
  const { state, addMovement, ensureDay } = useStore();
  const [step, setStep] = useState(presetWorkerId ? 2 : 1);
  const [workerId, setWorkerId] = useState<string | undefined>(presetWorkerId);
  const [amount, setAmount] = useState(0);

  const couriers = state.workers.filter((w) => w.active && w.role === "domiciliario");
  const worker = couriers.find((w) => w.id === workerId);

  function reset() { setStep(presetWorkerId ? 2 : 1); setWorkerId(presetWorkerId); setAmount(0); }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  function submit() {
    if (!worker || amount <= 0) return;
    ensureDay(date);
    addMovement(date, {
      category: 5, type: "egreso", medium: "cash", amount, workerId: worker.id,
      description: `Base entregada a ${worker.name}`, status: "confirmed",
    });
    toast.success(`✅ Base entregada a ${worker.name}`, { description: `Saliste $${amount.toLocaleString("es-CO")} de efectivo` });
    close();
  }

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={2}
      title={step === 1 ? "¿A quién le vas a dar la base?" : `¿Cuánto efectivo le vas a dar a ${worker?.name}?`}
      onBack={step === 2 ? () => setStep(1) : undefined}
    >
      {step === 1 && (
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-auto pr-1">
          {couriers.map((w: Worker) => (
            <button
              key={w.id}
              onClick={() => { setWorkerId(w.id); setStep(2); }}
              className="flex items-center gap-3 p-3 rounded-2xl glass hover:ring-cash transition text-left"
            >
              <Avatar worker={w} />
              <span className="font-medium">{w.name}</span>
            </button>
          ))}
        </div>
      )}

      {step === 2 && worker && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-3 glass rounded-2xl">
            <Avatar worker={worker} />
            <div>
              <div className="text-xs text-muted-foreground">Domiciliario</div>
              <div className="font-bold">{worker.name}</div>
            </div>
          </div>

          <MoneyInput value={amount} onChange={setAmount} autoFocus />

          <div className="flex flex-wrap gap-2">
            {[40000, 50000, 60000, 80000, 100000].map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="px-3 py-1.5 rounded-xl bg-secondary text-sm hover:bg-muted">
                +${v.toLocaleString("es-CO")}
              </button>
            ))}
          </div>

          {amount > 0 && (
            <div className="p-4 rounded-2xl bg-cash-soft ring-cash text-cash text-center font-medium animate-slide-in">
              Darás <span className="font-black tnum">${amount.toLocaleString("es-CO")}</span> a {worker.name}
            </div>
          )}

          <button
            disabled={amount <= 0}
            onClick={submit}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40 hover:scale-[1.01] active:scale-[0.99] transition"
          >
            <Banknote className="h-5 w-5" />
            Entregar base
            <Check className="h-5 w-5" />
          </button>
        </div>
      )}
    </WizardShell>
  );
}
