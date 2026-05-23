import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { Avatar } from "@/components/Avatar";
import { formatCOP } from "@/lib/format";
import { PayrollWizard } from "@/components/wizards/PayrollWizard";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/nomina")({ component: PayrollPage });

function PayrollPage() {
  const { state } = useStore();
  const { date } = useDay();
  const [openFor, setOpenFor] = useState<string | null>(null);

  const month = date.slice(0, 7);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">💼 Nómina</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {state.workers.filter(w => w.active).map(w => {
          // Aggregate this month
          let totalMonth = 0;
          const payments: { date: string; amount: number; medium: string; concept?: string }[] = [];
          for (const d of Object.keys(state.days)) {
            if (!d.startsWith(month)) continue;
            for (const m of state.days[d].movements) {
              if ((m.category === 15 || m.category === 18) && m.workerId === w.id) {
                totalMonth += m.amount;
                payments.push({ date: d, amount: m.amount, medium: m.medium, concept: m.description });
              }
            }
          }

          return (
            <div key={w.id} className="glass-strong rounded-3xl p-5">
              <div className="flex items-center gap-3">
                <Avatar worker={w} size={44} />
                <div className="flex-1">
                  <div className="font-bold">{w.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{w.role}</div>
                </div>
                <button onClick={() => setOpenFor(w.id)} className="bg-primary text-primary-foreground font-bold p-2 rounded-xl shadow-cash">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 p-3 rounded-xl bg-cash-soft text-cash">
                <div className="text-xs">Pagado este mes</div>
                <div className="text-2xl font-black tnum">{formatCOP(totalMonth)}</div>
              </div>
              {payments.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-40 overflow-auto">
                  {payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs glass rounded-lg px-3 py-2">
                      <span className="text-muted-foreground">{p.date} · {p.medium === "cash" ? "💵" : "🏦"}</span>
                      <span className="font-bold tnum">{formatCOP(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <PayrollWizard open={openFor === w.id} onOpenChange={(v) => !v && setOpenFor(null)} date={date} presetWorkerId={w.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
