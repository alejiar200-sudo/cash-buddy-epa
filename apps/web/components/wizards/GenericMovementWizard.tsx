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
  /**
   * Si se proporciona, fuerza al usuario a elegir entre efectivo y banco.
   * Cada opción mapea a su CategoryCode correspondiente.
   * Cuando esto está presente, `category` y `medium` se ignoran y se usan
   * los valores derivados de la elección del usuario.
   */
  mediumOptions?: { cash: CategoryCode; bank: CategoryCode };
}

export function GenericMovementWizard({
  open, onOpenChange, date, title, category, type, medium, needsWorker, status, mediumOptions,
}: Props) {
  const { state, addMovement, ensureDay } = useStore();
  const [amount, setAmount] = useState(0);
  const [workerId, setWorkerId] = useState<string | undefined>();
  const [desc, setDesc] = useState("");
  const [pickedMedium, setPickedMedium] = useState<Medium | null>(null);

  function close() {
    onOpenChange(false);
    setTimeout(() => { setAmount(0); setWorkerId(undefined); setDesc(""); setPickedMedium(null); }, 250);
  }

  async function submit() {
    if (amount <= 0) return;
    if (needsWorker && !workerId) return;
    if (mediumOptions && !pickedMedium) return;
    await ensureDay(date);
    const effMedium: Medium = mediumOptions ? (pickedMedium as Medium) : medium;
    const effCategory: CategoryCode = mediumOptions
      ? (pickedMedium === "cash" ? mediumOptions.cash : mediumOptions.bank)
      : category;
    await addMovement(date, {
      category: effCategory,
      type,
      medium: effMedium,
      amount,
      workerId,
      description: desc || title,
      status: status ?? "confirmed",
    });
    toast.success(`✅ ${title} registrado`);
    close();
  }

  const couriers = state.workers.filter((w) => w.active);
  const submitDisabled =
    amount <= 0
    || (needsWorker && !workerId)
    || (!!mediumOptions && !pickedMedium);

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

        {mediumOptions && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">¿Efectivo o banco?</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPickedMedium("cash")}
                className={`p-4 rounded-2xl border-2 font-bold transition ${pickedMedium === "cash" ? "border-primary bg-cash-soft text-cash" : "border-border glass hover:border-primary/50"}`}
              >
                💵 Efectivo
              </button>
              <button
                onClick={() => setPickedMedium("bank")}
                className={`p-4 rounded-2xl border-2 font-bold transition ${pickedMedium === "bank" ? "border-accent bg-bank-soft text-bank" : "border-border glass hover:border-accent/50"}`}
              >
                🏦 Banco
              </button>
            </div>
          </div>
        )}

        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)" className="w-full glass rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40" />
        <MoneyInput value={amount} onChange={setAmount} autoFocus />
        <button onClick={submit} disabled={submitDisabled} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">
          ✅ Registrar
        </button>
      </div>
    </WizardShell>
  );
}
