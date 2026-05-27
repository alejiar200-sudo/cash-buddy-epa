import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { useStore, type CategoryCode, type Medium, type MovementType, type MovementStatus } from "@/lib/store";
import { Avatar } from "../Avatar";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  title: string;
  category: CategoryCode;
  type: MovementType;
  medium: Medium;
  needsWorker?: boolean;
  status?: MovementStatus;
}

export function GenericMovementWizard({ open, onOpenChange, date, title, category, type, medium, needsWorker, status }: Props) {
  const { state, addMovement, ensureDay } = useStore();
  const [amount, setAmount] = useState(0);
  const [workerId, setWorkerId] = useState<string | undefined>();
  const [desc, setDesc] = useState("");

  function close() {
    onOpenChange(false);
    setTimeout(() => { setAmount(0); setWorkerId(undefined); setDesc(""); }, 250);
  }

  function submit() {
    if (amount <= 0) return;
    if (needsWorker && !workerId) return;
    ensureDay(date);
    addMovement(date, { category, type, medium, amount, workerId, description: desc || title, status: status ?? "confirmed" });
    toast.success(`✅ ${title} registrado`);
    close();
  }

  const couriers = state.workers.filter((w) => w.active);

  return (
    <WizardShell open={open} onOpenChange={(v) => { if (!v) close(); }} step={1} total={1} title={title}>
      <div className="space-y-4">
        {needsWorker && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Trabajador</div>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">
              {couriers.map((w) => (
                <button key={w.id} onClick={() => setWorkerId(w.id)} className={`flex items-center gap-2 p-2 rounded-xl glass text-left ${workerId === w.id ? "ring-cash" : ""}`}>
                  <Avatar worker={w} size={28} />
                  <span className="text-sm font-medium">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)" className="w-full glass rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40" />
        <MoneyInput value={amount} onChange={setAmount} autoFocus />
        <button onClick={submit} disabled={amount <= 0 || (needsWorker && !workerId)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">
          ✅ Registrar
        </button>
      </div>
    </WizardShell>
  );
}
