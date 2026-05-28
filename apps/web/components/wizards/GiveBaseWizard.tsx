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
  const [medium, setMedium] = useState<"cash" | "bank" | null>(null);

  const couriers = state.workers.filter((w) => w.active && w.role === "domiciliario");
  const worker = couriers.find((w) => w.id === workerId);

  function reset() { setStep(presetWorkerId ? 2 : 1); setWorkerId(presetWorkerId); setAmount(0); setMedium(null); }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit() {
    if (!worker || amount <= 0 || !medium) return;
    await ensureDay(date);
    await addMovement(date, {
      category: medium === "cash" ? 5 : 6,
      type: "egreso",
      medium,
      amount,
      workerId: worker.id,
      description: `Base entregada a ${worker.name} (${medium === "cash" ? "efectivo" : "banco"})`,
      status: "confirmed",
    });
    toast.success(`✅ Base entregada a ${worker.name}`, {
      description: `${medium === "cash" ? "💵 Efectivo" : "🏦 Banco"} · $${amount.toLocaleString("es-CO")}`,
    });
    close();
  }

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={presetWorkerId ? 1 : step}
      total={presetWorkerId ? 1 : 2}
      title={step === 1 ? "¿A quién le vas a dar la base?" : `Dar base a ${worker?.name?.toUpperCase() ?? ""}`}
      subtitle={step === 2 ? "Elige el medio y el monto" : undefined}
      onBack={step === 2 && !presetWorkerId ? () => setStep(1) : undefined}
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

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">¿En qué medio le das la base?</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMedium("cash")}
                className={`p-4 rounded-2xl border-2 font-bold transition ${medium === "cash" ? "border-primary bg-cash-soft text-cash" : "border-border glass hover:border-primary/50"}`}
              >
                💵 Efectivo
              </button>
              <button
                onClick={() => setMedium("bank")}
                className={`p-4 rounded-2xl border-2 font-bold transition ${medium === "bank" ? "border-accent bg-bank-soft text-bank" : "border-border glass hover:border-accent/50"}`}
              >
                🏦 Banco
              </button>
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

          {amount > 0 && medium && (
            <div className={`p-4 rounded-2xl text-center font-medium animate-slide-in ${medium === "cash" ? "bg-cash-soft ring-cash text-cash" : "bg-bank-soft ring-bank text-bank"}`}>
              Darás <span className="font-black tnum">${amount.toLocaleString("es-CO")}</span> a {worker.name} por {medium === "cash" ? "💵 efectivo" : "🏦 banco"}
            </div>
          )}

          <button
            disabled={amount <= 0 || !medium}
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
