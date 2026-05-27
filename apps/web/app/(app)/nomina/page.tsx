"use client";

import { useMemo, useState } from "react";
import { useStore, commissionsForWorker, fixedPayrollForWorker, type Medium } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { Avatar } from "@/components/Avatar";
import { formatCOP } from "@/lib/format";
import { PayrollWizard } from "@/components/wizards/PayrollWizard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function PayrollPage() {
  const { state } = useStore();
  const { date } = useDay();
  const monthPrefix = date.slice(0, 7);

  const couriers = state.workers.filter((w) => w.active && w.role === "domiciliario");

  // Summary cards
  const summary = useMemo(() => {
    return state.workers.filter((w) => w.active).map((w) => {
      const c = commissionsForWorker(state, w.id, monthPrefix);
      const commissionPending = c.filter((r) => r.status === "pending").reduce((s, r) => s + r.commission, 0);
      const commissionPaid = c.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.commission, 0);
      const fx = fixedPayrollForWorker(state, w.id, monthPrefix);
      return {
        worker: w,
        commissionPending,
        commissionPaid,
        fixedPending: fx.pending,
        fixedPaid: fx.paid,
        totalPending: commissionPending + fx.pending,
        totalPaid: commissionPending * 0 + commissionPaid + fx.paid,
      };
    });
  }, [state, monthPrefix]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">💼 Nómina</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {summary.map((s) => (
          <div key={s.worker.id} className="glass-strong rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Avatar worker={s.worker} size={36} />
              <div className="flex-1">
                <div className="font-bold text-sm">{s.worker.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">{s.worker.role}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs tnum">
              <Row label="Comisiones pend." value={formatCOP(s.commissionPending)} color="text-warn" />
              <Row label="Nómina fija pend." value={formatCOP(s.fixedPending)} color="text-warn" />
              <Row label="TOTAL a pagar" value={formatCOP(s.totalPending)} color="text-danger" big />
              <Row label="Pagado este mes" value={formatCOP(s.totalPaid)} color="text-cash" />
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="commissions">
        <TabsList className="bg-card">
          <TabsTrigger value="commissions">🛵 Comisiones domicilios</TabsTrigger>
          <TabsTrigger value="fixed">💼 Nómina fija</TabsTrigger>
        </TabsList>

        <TabsContent value="commissions" className="mt-4 space-y-3">
          {couriers.map((w) => (
            <CommissionAccordion key={w.id} workerId={w.id} monthPrefix={monthPrefix} />
          ))}
        </TabsContent>

        <TabsContent value="fixed" className="mt-4">
          <FixedPayrollPanel monthPrefix={monthPrefix} date={date} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${color ?? ""} ${big ? "font-black text-base" : "font-bold"} tnum`}>{value}</span>
    </div>
  );
}

function CommissionAccordion({ workerId, monthPrefix }: { workerId: string; monthPrefix: string }) {
  const { state, updateMovement } = useStore();
  const worker = state.workers.find((w) => w.id === workerId)!;
  const rows = commissionsForWorker(state, workerId, monthPrefix);
  const [open, setOpen] = useState(true);
  const [payRowId, setPayRowId] = useState<string | null>(null);
  const [payAllOpen, setPayAllOpen] = useState(false);

  const pendingRows = rows.filter((r) => r.status === "pending");
  const paidRows = rows.filter((r) => r.status === "confirmed");
  const totalPending = pendingRows.reduce((s, r) => s + r.commission, 0);
  const totalPaid = paidRows.reduce((s, r) => s + r.commission, 0);

  function payOne(id: string, medium: Medium) {
    // Find date for this movement
    for (const date of Object.keys(state.days)) {
      const m = state.days[date].movements.find((x) => x.id === id);
      if (m) {
        void updateMovement(date, id, {
          status: "confirmed",
          medium,
          category: medium === "cash" ? 15 : 18,
        });
        break;
      }
    }
    setPayRowId(null);
    toast.success("✅ Comisión pagada");
  }

  function payAll(medium: Medium) {
    for (const r of pendingRows) {
      void updateMovement(r.date, r.id, {
        status: "confirmed",
        medium,
        category: medium === "cash" ? 15 : 18,
      });
    }
    setPayAllOpen(false);
    toast.success(`✅ Pagué todo lo pendiente de ${worker.name}`);
  }

  if (rows.length === 0) return null;

  return (
    <div className="glass-strong rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 hover:bg-secondary/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Avatar worker={worker} size={32} />
        <div className="flex-1 text-left">
          <div className="font-bold">{worker.name}</div>
          <div className="text-xs text-muted-foreground">
            {pendingRows.length} pend. · {paidRows.length} pagadas
          </div>
        </div>
        <div className="text-right text-xs tnum">
          <div className="text-warn font-bold">Pend: {formatCOP(totalPending)}</div>
          <div className="text-cash">Pagado: {formatCOP(totalPaid)}</div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-right py-2">Valor domicilio</th>
                  <th className="text-right py-2">Comisión</th>
                  <th className="text-center py-2">Estado</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2">{r.date}</td>
                    <td className="py-2 text-right tnum">{formatCOP(r.deliveryValue)}</td>
                    <td className="py-2 text-right tnum font-bold">{formatCOP(r.commission)}</td>
                    <td className="py-2 text-center text-xs">
                      {r.status === "pending"
                        ? <span className="text-warn">⏳ Pendiente</span>
                        : <span className="text-cash">✅ Pagado ({r.medium === "cash" ? "💵" : "🏦"})</span>}
                    </td>
                    <td className="py-2 text-right">
                      {r.status === "pending" && (
                        <button onClick={() => setPayRowId(r.id)} className="text-xs font-bold px-2 py-1 rounded-md bg-primary text-primary-foreground">
                          ✅ Ya pagué
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td colSpan={2} className="py-2 text-right text-xs uppercase text-muted-foreground">Total pendiente</td>
                  <td className="py-2 text-right font-black tnum text-warn">{formatCOP(totalPending)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-1 text-right text-xs uppercase text-muted-foreground">Total pagado</td>
                  <td className="py-1 text-right font-bold tnum text-cash">{formatCOP(totalPaid)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {totalPending > 0 && (
            <button
              onClick={() => setPayAllOpen(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl shadow-cash text-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              Pagar todo lo pendiente de {worker.name} ({formatCOP(totalPending)})
            </button>
          )}

          {payRowId && (
            <MediumModal
              title={`¿Cómo le pagaste la comisión a ${worker.name}?`}
              amount={pendingRows.find((r) => r.id === payRowId)?.commission ?? 0}
              onCancel={() => setPayRowId(null)}
              onPick={(m) => payOne(payRowId, m)}
            />
          )}
          {payAllOpen && (
            <MediumModal
              title={`Pagar todo lo pendiente de ${worker.name}`}
              amount={totalPending}
              onCancel={() => setPayAllOpen(false)}
              onPick={(m) => payAll(m)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MediumModal({ title, amount, onPick, onCancel }: { title: string; amount: number; onPick: (m: Medium) => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="glass-strong rounded-3xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold">{title}</div>
        <div className="mt-2 text-3xl font-black text-cash tnum">{formatCOP(amount)}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => onPick("cash")} className="p-4 rounded-2xl border-2 border-border glass font-bold hover:border-primary hover:bg-cash-soft">💵 Efectivo</button>
          <button onClick={() => onPick("bank")} className="p-4 rounded-2xl border-2 border-border glass font-bold hover:border-accent hover:bg-bank-soft">🏦 Banco</button>
        </div>
        <button onClick={onCancel} className="mt-3 w-full py-2.5 rounded-xl bg-secondary text-sm">Cancelar</button>
      </div>
    </div>
  );
}

function FixedPayrollPanel({ monthPrefix, date }: { monthPrefix: string; date: string }) {
  const { state } = useStore();
  const [openFor, setOpenFor] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {state.workers.filter((w) => w.active).map((w) => {
        const fx = fixedPayrollForWorker(state, w.id, monthPrefix);
        return (
          <div key={w.id} className="glass-strong rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <Avatar worker={w} size={44} />
              <div className="flex-1">
                <div className="font-bold">{w.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{w.role}</div>
              </div>
              <button onClick={() => setOpenFor(w.id)} className="bg-primary text-primary-foreground font-bold p-2 rounded-xl shadow-cash" title="Registrar pago">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-cash-soft text-cash">
              <div className="text-xs">Pagado este mes (nómina fija)</div>
              <div className="text-2xl font-black tnum">{formatCOP(fx.paid)}</div>
            </div>
            {fx.payments.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-40 overflow-auto">
                {fx.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs glass rounded-lg px-3 py-2">
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
  );
}
