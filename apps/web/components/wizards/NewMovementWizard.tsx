import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GiveBaseWizard } from "./GiveBaseWizard";
import { ExpenseWizard } from "./ExpenseWizard";
import { ConversionWizard } from "./ConversionWizard";
import { PayrollWizard } from "./PayrollWizard";
import { GenericMovementWizard } from "./GenericMovementWizard";
import { Banknote, Wallet, ArrowDownToLine, ArrowUpFromLine, Receipt, Briefcase, RefreshCw, Clock, Pin } from "lucide-react";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; date: string; }

type Choice =
  | "deliveries-cash" | "deliveries-bank" | "give-base" | "receive-base"
  | "expense" | "payroll" | "conversion" | "temp-out" | "pending-in";

export function NewMovementWizard({ open, onOpenChange, date }: Props) {
  const [choice, setChoice] = useState<Choice | null>(null);

  function close() { onOpenChange(false); setTimeout(() => setChoice(null), 250); }

  const options: { id: Choice; icon: any; title: string; subtitle: string }[] = [
    { id: "deliveries-cash", icon: Banknote, title: "💵 Domicilios", subtitle: "en efectivo" },
    { id: "deliveries-bank", icon: Wallet, title: "🏦 Domicilios", subtitle: "por banco" },
    { id: "give-base", icon: ArrowUpFromLine, title: "📤 Dar base", subtitle: "efectivo" },
    { id: "receive-base", icon: ArrowDownToLine, title: "📥 Recibir base", subtitle: "devuelta" },
    { id: "expense", icon: Receipt, title: "💸 Gasto empresa", subtitle: "efectivo o banco" },
    { id: "payroll", icon: Briefcase, title: "💼 Pagar nómina", subtitle: "" },
    { id: "conversion", icon: RefreshCw, title: "🔄 Conversión", subtitle: "efectivo ↔ banco" },
    { id: "temp-out", icon: Clock, title: "⏳ Salida temporal", subtitle: "" },
    { id: "pending-in", icon: Pin, title: "📌 Ingreso", subtitle: "pendiente" },
  ];

  return (
    <>
      <Dialog open={open && !choice} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-2xl p-0 bg-card border-border rounded-3xl">
          <div className="px-6 py-5 border-b border-border">
            <DialogTitle className="text-2xl font-bold">¿Qué quieres registrar?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Toca una opción</p>
          </div>
          <div className="p-5 grid grid-cols-3 gap-3">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setChoice(opt.id)}
                className="glass hover:ring-cash p-4 rounded-2xl text-left transition group hover:scale-[1.03]"
              >
                <opt.icon className="h-7 w-7 text-primary mb-3" />
                <div className="font-bold text-sm">{opt.title}</div>
                {opt.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{opt.subtitle}</div>}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {choice === "give-base" && (
        <GiveBaseWizard open onOpenChange={(v) => { if (!v) close(); }} date={date} />
      )}
      {choice === "expense" && (
        <ExpenseWizard open onOpenChange={(v) => { if (!v) close(); }} date={date} />
      )}
      {choice === "conversion" && (
        <ConversionWizard open onOpenChange={(v) => { if (!v) close(); }} date={date} />
      )}
      {choice === "payroll" && (
        <PayrollWizard open onOpenChange={(v) => { if (!v) close(); }} date={date} />
      )}
      {choice === "deliveries-cash" && (
        <GenericMovementWizard open onOpenChange={(v) => { if (!v) close(); }} date={date}
          title="Domicilios en efectivo" category={1} type="ingreso" medium="cash" needsWorker />
      )}
      {choice === "deliveries-bank" && (
        <GenericMovementWizard open onOpenChange={(v) => { if (!v) close(); }} date={date}
          title="Domicilios por banco" category={2} type="ingreso" medium="bank" needsWorker />
      )}
      {choice === "receive-base" && (
        <GenericMovementWizard open onOpenChange={(v) => { if (!v) close(); }} date={date}
          title="Recibir base devuelta" category={5} type="ingreso" medium="cash" needsWorker />
      )}
      {choice === "temp-out" && (
        <GenericMovementWizard open onOpenChange={(v) => { if (!v) close(); }} date={date}
          title="Salida temporal" category={11} type="egreso" medium="cash" />
      )}
      {choice === "pending-in" && (
        <GenericMovementWizard open onOpenChange={(v) => { if (!v) close(); }} date={date}
          title="Ingreso pendiente" category={13} type="ingreso" medium="cash" status="pending" />
      )}
    </>
  );
}
