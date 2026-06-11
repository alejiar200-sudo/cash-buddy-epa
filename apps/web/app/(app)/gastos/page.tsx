"use client";

import { useEffect, useState } from "react";
import { useStore, CATEGORY_LABEL } from "@/lib/store";
import { formatCOP } from "@/lib/format";
import { Plus, Receipt, Check, X, Clock } from "lucide-react";
import { ExpenseWizard } from "@/components/wizards/ExpenseWizard";
import { useDay } from "@/lib/day-context";
import { useAuth } from "@/lib/auth";
import * as api from "@/lib/sd-api";
import type { PendingMovement } from "@/lib/sd-api";
import { toast } from "sonner";
import { useLive } from "@/lib/use-live";

export default function GastosPage() {
  const { state, getDay, refreshDay } = useStore();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { date } = useDay();
  const day = getDay(date);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pending, setPending] = useState<PendingMovement[]>([]);

  const loadPending = () => api.getPendingMovements().then(setPending).catch(() => {});
  useEffect(() => { loadPending(); }, []);
  // Actualización en vivo: refresca pendientes y los gastos confirmados del día
  useLive(() => { loadPending(); refreshDay(date); }, 5000);

  async function approve(id: string) {
    try { await api.approveMovement(id); toast.success("Gasto aprobado"); loadPending(); refreshDay(date); }
    catch (err) { toast.error(String(err)); }
  }
  async function reject(id: string) {
    if (!confirm("¿Rechazar este gasto? Se eliminará.")) return;
    try { await api.rejectMovement(id); toast.success("Gasto rechazado"); loadPending(); }
    catch (err) { toast.error(String(err)); }
  }

  // Gastos confirmados (cat 3 y 4). Los pendientes no suman a totales.
  const allExpenses = Object.entries(state.days)
    .flatMap(([d, dayData]) =>
      dayData.movements
        .filter(m => (m.category === 3 || m.category === 4) && m.status === "confirmed")
        .map(m => ({ ...m, date: d }))
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  const totalCash = allExpenses.filter(m => m.medium === "cash").reduce((s, m) => s + m.amount, 0);
  const totalBank = allExpenses.filter(m => m.medium === "bank").reduce((s, m) => s + m.amount, 0);

  // Gastos pendientes de aprobación (cat 3/4)
  const pendingExpenses = pending.filter(m => m.category === 3 || m.category === 4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">🧾 Gastos</h1>
          <p className="text-sm text-muted-foreground">Registro de gastos en efectivo y banco</p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> Registrar gasto
        </button>
      </div>

      {/* Pendientes de aprobación */}
      {pendingExpenses.length > 0 && (
        <div className="glass-strong rounded-3xl p-5 border-2 border-amber-500/30">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <h2 className="font-bold">Pendientes de aprobación ({pendingExpenses.length})</h2>
          </div>
          <div className="space-y-2">
            {pendingExpenses.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/5">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.description || "Gasto"}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.date} {m.time} · {m.medium === "cash" ? "💵 Efectivo" : "🏦 Banco"}
                    {m.createdBy ? " · registrado por personal" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black text-red-500 tnum">−{formatCOP(m.amount)}</span>
                  {isAdmin ? (
                    <>
                      <button onClick={() => approve(m.id)} title="Aprobar"
                        className="p-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition"><Check className="h-4 w-4" /></button>
                      <button onClick={() => reject(m.id)} title="Rechazar"
                        className="p-2 rounded-lg border-2 border-red-500/30 text-red-500 hover:bg-red-500/10 transition"><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <span className="text-xs text-amber-600 font-bold">Esperando aprobación</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-strong rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">Total gastos</div>
          <div className="font-black text-xl text-red-500 tnum mt-1">{formatCOP(totalCash + totalBank)}</div>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">💵 En efectivo</div>
          <div className="font-black text-xl tnum mt-1">{formatCOP(totalCash)}</div>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <div className="text-xs text-muted-foreground">🏦 En banco</div>
          <div className="font-black text-xl tnum mt-1">{formatCOP(totalBank)}</div>
        </div>
      </div>

      {/* Lista de gastos */}
      {allExpenses.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-bold text-lg">Sin gastos registrados</p>
          <p className="text-sm text-muted-foreground mt-1">Registra el primer gasto del negocio</p>
          <button onClick={() => setWizardOpen(true)} className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
            + Registrar gasto
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {allExpenses.map((m, i) => (
            <div key={m.id ?? i} className="glass-strong rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${m.medium === "cash" ? "bg-orange-500/10" : "bg-blue-500/10"}`}>
                  {m.medium === "cash" ? "💵" : "🏦"}
                </div>
                <div>
                  <p className="font-medium text-sm">{m.description || CATEGORY_LABEL[m.category] || "Gasto"}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.date === date ? "Hoy" : m.date} · {m.time}
                    {(m as { taxAmount?: number }).taxAmount ? ` · IVA: ${formatCOP((m as { taxAmount?: number }).taxAmount!)}` : ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-black text-red-500 tnum">−{formatCOP(m.amount)}</span>
                <div className="text-xs text-muted-foreground capitalize">{m.medium === "cash" ? "Efectivo" : "Banco"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ExpenseWizard open={wizardOpen} onOpenChange={setWizardOpen} date={date} />
    </div>
  );
}
