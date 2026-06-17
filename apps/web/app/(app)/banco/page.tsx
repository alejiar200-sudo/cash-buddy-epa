"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { UnifiedBankMovement, Driver } from "@/lib/sd-api";
import { UnifiedBankWizard } from "@/components/wizards/UnifiedBankWizard";
import { useLive } from "@/lib/use-live";
import { formatCOP as _fmt } from "@/lib/format";

function formatCOP(n: number) { return _fmt ? _fmt(n) : "$" + n.toLocaleString("es-CO"); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const TYPE_CONFIG = {
  ingreso:      { icon: TrendingUp,   color: "text-green-600",  bg: "bg-green-500/10",  label: "Ingreso",      badge: "bg-green-500/20 text-green-700" },
  egreso:       { icon: TrendingDown, color: "text-red-500",    bg: "bg-red-500/10",    label: "Salida",       badge: "bg-red-500/20 text-red-700" },
  consignacion: { icon: TrendingUp,   color: "text-blue-600",   bg: "bg-blue-500/10",   label: "Efectivo→Banco",badge: "bg-blue-500/20 text-blue-700" },
  retiro:       { icon: TrendingDown, color: "text-orange-500", bg: "bg-orange-500/10", label: "Banco→Efectivo",badge: "bg-orange-500/20 text-orange-700" },
} as const;

// Fila: par cuadrado (movimiento + su contraparte enlazada por pairId) o movimiento solo.
type BankRow =
  | { kind: "pair"; ingreso: UnifiedBankMovement; egreso: UnifiedBankMovement; date: string }
  | { kind: "single"; mov: UnifiedBankMovement };

// Empareja por pairId EXPLÍCITO (no por monto): solo se cuadran los movimientos que
// el usuario enlazó al registrar la contraparte. Los demás quedan solos (rojo = falta contraparte).
function buildRows(movs: UnifiedBankMovement[]): BankRow[] {
  const rows: BankRow[] = [];
  const used = new Set<string>();

  // Agrupar por pairId los que lo tengan.
  const byPair = new Map<string, UnifiedBankMovement[]>();
  for (const m of movs) {
    if (m.pairId) {
      const g = byPair.get(m.pairId) ?? [];
      g.push(m);
      byPair.set(m.pairId, g);
    }
  }

  for (const [, group] of byPair) {
    const ing = group.find(g => g.type === "ingreso" || g.type === "consignacion");
    const egr = group.find(g => g.type === "egreso" || g.type === "retiro");
    if (ing && egr) {
      used.add(ing.id); used.add(egr.id);
      rows.push({ kind: "pair", ingreso: ing, egreso: egr, date: ing.date > egr.date ? ing.date : egr.date });
    }
  }

  // El resto, individuales (los ingreso/egreso solos saldrán en rojo "falta contraparte").
  for (const m of movs) {
    if (used.has(m.id)) continue;
    rows.push({ kind: "single", mov: m });
  }

  return rows.sort((a, b) => {
    const da = a.kind === "pair" ? a.date : a.mov.date;
    const db = b.kind === "pair" ? b.date : b.mov.date;
    return new Date(db).getTime() - new Date(da).getTime();
  });
}

export default function BancoPage() {
  const [movements, setMovements] = useState<UnifiedBankMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ type: "ingreso" | "egreso"; amount: number; pairWith?: string } | undefined>();
  const [applyModal, setApplyModal] = useState<{ mov: UnifiedBankMovement } | null>(null);

  // `silent` = refresco en vivo: sin spinner y sin re-render si nada cambió (evita parpadeo).
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getUnifiedBankMovements({ from: fromDate || undefined, to: toDate || undefined });
      setMovements(prev => {
        const same = prev.length === data.length && JSON.stringify(prev) === JSON.stringify(data);
        return same ? prev : data;
      });
    } catch { if (!silent) toast.error("Error al cargar movimientos"); }
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fromDate, toDate]);
  useLive(() => load(true), 5000);

  const rows = buildRows(movements);
  const ingresos = movements.filter(m => m.type === "ingreso" || m.type === "consignacion").reduce((s, m) => s + m.amount, 0);
  const egresos  = movements.filter(m => m.type === "egreso" || m.type === "retiro").reduce((s, m) => s + m.amount, 0);
  const balance  = ingresos - egresos;
  // Movimiento asignado a domiciliario = ya tiene contraparte implícita, no cuenta como pendiente.
  // Movimiento marcado explícitamente "sin contraparte" tampoco cuenta como pendiente (#11).
  const sinContraparte = rows.filter(r => r.kind === "single" && (r.mov.type === "ingreso" || r.mov.type === "egreso") && !r.mov.driverName && !r.mov.noCounterpart).length;

  // Registrar la contraparte: prefija tipo y monto, ENLAZA por pairWith. No copia descripción.
  function registrarContraria(m: UnifiedBankMovement) {
    const opposite = m.type === "ingreso" ? "egreso" : "ingreso";
    setPrefill({ type: opposite, amount: m.amount, pairWith: m.id });
    setWizardOpen(true);
  }

  async function remove(m: UnifiedBankMovement) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    try {
      if (m.source === "bank") await api.deleteBankTransaction(m.id);
      else await api.deleteConversion(m.id);
      toast.success("Eliminado");
      load();
    } catch (err) { toast.error(String(err)); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Banco</h1>
          <p className="text-sm text-muted-foreground">Movimientos de dinero de la empresa (efectivo y transferencia)</p>
        </div>
        <button
          onClick={() => { setPrefill(undefined); setWizardOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition"
        >
          <Plus className="h-4 w-4" /> Registrar movimiento
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Ingresos" value={formatCOP(ingresos)} color="text-green-600" />
        <SummaryCard label="Salidas" value={formatCOP(egresos)} color="text-red-500" />
        <SummaryCard label="Balance neto" value={formatCOP(balance)} color={balance === 0 ? "text-green-600" : "text-amber-500"} />
        <SummaryCard label="Falta contraparte" value={String(sinContraparte)} color={sinContraparte === 0 ? "text-green-600" : "text-red-500"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm" />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm" />
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(""); setToDate(""); }} className="px-3 py-1.5 rounded-xl border border-border text-sm hover:bg-secondary transition">✕ Limpiar</button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <p className="text-4xl mb-3">🏦</p>
          <p className="font-bold text-lg">Sin movimientos</p>
          <button onClick={() => { setPrefill(undefined); setWizardOpen(true); }} className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
            + Registrar movimiento
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => {
            // ── Par cuadrado: movimiento + su contraparte enlazada → VERDE ──
            if (row.kind === "pair") {
              const { ingreso, egreso } = row;
              return (
                <div key={`pair-${ingreso.id}-${egreso.id}`} className="glass-strong rounded-2xl p-4 border border-green-500/30 bg-green-500/[0.05]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Movimiento cuadrado</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MovHalf mov={egreso} />
                    <span className="text-muted-foreground text-lg shrink-0">⇄</span>
                    <MovHalf mov={ingreso} />
                    <button onClick={() => { remove(egreso); }} className="p-1.5 rounded-lg hover:bg-secondary transition text-muted-foreground hover:text-destructive shrink-0" title="Eliminar par">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            }

            // ── Movimiento solo ──
            const m = row.mov;
            const cfg = TYPE_CONFIG[m.type];
            const Icon = cfg.icon;
            const isMixed = m.cashPart != null;
            const isPositive = m.type === "ingreso" || m.type === "consignacion";
            // Rojo solo si no tiene contraparte NI domiciliario asignado NI está marcado
            // explícitamente como "sin contraparte" (#11). Con cualquiera de esos = cerrado.
            const hasDriver = !!m.driverName;
            const closed = hasDriver || m.noCounterpart === true;
            const red = (m.type === "ingreso" || m.type === "egreso") && !closed;
            const cardClass = red
              ? "border-2 border-red-500 bg-red-500/10"
              : closed
              ? "border border-green-500/30 bg-green-500/[0.05]"
              : "border border-green-500/20 bg-green-500/[0.03]";
            return (
              <div key={`${m.source}-${m.id}-${idx}`} className={`glass-strong rounded-2xl p-4 ${cardClass}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${red ? "bg-red-500/20" : cfg.bg}`}>
                      <Icon className={`h-5 w-5 ${red ? "text-red-500" : cfg.color}`} />
                    </div>
                    <div className="min-w-0">
                      {/* DESCRIPCIÓN prominente (no se recorta, se ve completa) */}
                      <p className={`font-bold text-base leading-snug ${red ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                        {m.description}
                      </p>
                      {/* Etiquetas */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${cfg.badge}`}>{cfg.label}</span>
                        {isMixed ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400">💵+🏦 Mixto</span>
                        ) : m.medium && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${m.medium === "cash" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-blue-500/20 text-blue-700 dark:text-blue-400"}`}>
                            {m.medium === "cash" ? "💵 Efectivo" : "🏦 Transferencia"}
                          </span>
                        )}
                        {hasDriver && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">↩️ Deuda de {m.driverName}</span>}
                        {!hasDriver && m.noCounterpart && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-green-500/20 text-green-700 dark:text-green-400">✓ No necesita contraparte</span>}
                        {!hasDriver && !m.noCounterpart && !m.pairId && (m.type === "ingreso" || m.type === "egreso") && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-500/20 text-red-700 dark:text-red-400">⚠️ Falta contraparte</span>
                        )}
                      </div>
                      {/* Historial / detalle del movimiento */}
                      <p className="text-xs text-muted-foreground mt-1">
                        🗓️ {fmtDate(m.date)}
                        {isMixed ? ` · 💵 ${formatCOP(m.cashPart ?? 0)} efectivo + 🏦 ${formatCOP(m.bankPart ?? 0)} transferencia` : ""}
                        {!isMixed && m.medium ? ` · ${m.type === "ingreso" || m.type === "consignacion" ? "Entró" : "Salió"} por ${m.medium === "cash" ? "efectivo" : "transferencia"}` : ""}
                        {m.createdByName ? ` · 👤 Registró: ${m.createdByName}` : ""}
                        {m.reference ? ` · Ref: ${m.reference}` : ""}{m.branchName ? ` · ${m.branchName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-black text-lg tnum ${red ? "text-red-500" : isPositive ? "text-green-600" : "text-red-500"}`}>
                      {isPositive ? "+" : "−"}{formatCOP(m.amount)}
                    </span>
                    <button onClick={() => remove(m)} className="p-1.5 rounded-lg hover:bg-secondary transition text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {(!hasDriver) && (
                  <div className="mt-3 flex gap-2">
                    {red && (
                      <button
                        onClick={() => registrarContraria(m)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar {m.type === "ingreso" ? "Salida" : "Ingreso"} de {formatCOP(m.amount)} para cuadrar
                      </button>
                    )}
                    {m.source === "bank" && (
                      <button
                        onClick={() => setApplyModal({ mov: m })}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 text-sm font-bold hover:bg-amber-500/30 transition border border-amber-500/30"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Descontar de deuda
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <UnifiedBankWizard
        open={wizardOpen}
        onOpenChange={(v) => { setWizardOpen(v); if (!v) setPrefill(undefined); }}
        prefill={prefill}
        onDone={load}
      />

      {applyModal && (
        <ApplyToDriverModal
          mov={applyModal.mov}
          onClose={() => setApplyModal(null)}
          onDone={() => { setApplyModal(null); load(); }}
        />
      )}
    </div>
  );
}

// Una mitad de un par cuadrado (un movimiento y su contraparte).
function MovHalf({ mov }: { mov: UnifiedBankMovement }) {
  const isIn = mov.type === "ingreso" || mov.type === "consignacion";
  const isMixed = mov.cashPart != null;
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-background/50 px-3 py-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-xs font-bold ${isIn ? "text-green-600" : "text-red-500"}`}>{isIn ? "📥 Entró" : "📤 Salió"}</span>
        {isMixed ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400">💵+🏦 Mixto</span>
        ) : mov.medium && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${mov.medium === "cash" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-blue-500/20 text-blue-700 dark:text-blue-400"}`}>
            {mov.medium === "cash" ? "💵 Efectivo" : "🏦 Transferencia"}
          </span>
        )}
      </div>
      <div className={`font-black text-base tnum mt-0.5 ${isIn ? "text-green-600" : "text-red-500"}`}>
        {isIn ? "+" : "−"}{formatCOP(mov.amount)}
      </div>
      {isMixed && (
        <div className="text-[11px] text-muted-foreground">💵 {formatCOP(mov.cashPart ?? 0)} + 🏦 {formatCOP(mov.bankPart ?? 0)}</div>
      )}
      {mov.description && <div className="text-[11px] text-muted-foreground truncate">{mov.description}</div>}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-black text-xl tnum mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function ApplyToDriverModal({ mov, onClose, onDone }: { mov: UnifiedBankMovement; onClose: () => void; onDone: () => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ applied: number; previousDebt: number; newDebt: number; creditAmount: number; creditMedium: string | null; excess: number } | null>(null);

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(() => {});
  }, []);

  const selected = drivers.find(d => d.id === driverId);

  async function apply() {
    if (!driverId) return;
    setLoading(true);
    try {
      const res = await api.applyBankToDriver(mov.id, driverId);
      setResult(res);
    } catch (e) { toast.error(String(e)); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-strong rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">Descontar de deuda</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition text-muted-foreground">✕</button>
        </div>

        <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{mov.description}</p>
          <p className="text-2xl font-black tnum mt-1">{formatCOP(mov.amount)}</p>
          <p className="text-xs text-muted-foreground">{mov.medium === "cash" ? "💵 Efectivo" : "🏦 Transferencia"}</p>
        </div>

        {!result ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-bold">Domiciliario</label>
              <select
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
              >
                <option value="">— Seleccionar —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.branch.name} · Deuda: {formatCOP(d.pendingDebt)}
                  </option>
                ))}
              </select>
              {selected && (
                <div className="flex gap-2 text-sm">
                  <span className="px-2 py-1 rounded-lg bg-red-500/10 text-red-600 font-bold">
                    Debe: {formatCOP(selected.pendingDebt)}
                  </span>
                  {selected.creditAmount > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 font-bold">
                      Crédito: {formatCOP(selected.creditAmount)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition">Cancelar</button>
              <button
                onClick={apply}
                disabled={!driverId || loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? "Aplicando…" : "Confirmar"}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-center">Resultado del descuento</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-secondary/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Deuda anterior</p>
                <p className="font-black tnum text-red-500">{formatCOP(result.previousDebt)}</p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground">Monto aplicado</p>
                <p className="font-black tnum text-green-600">{formatCOP(result.applied)}</p>
              </div>
            </div>

            {result.newDebt > 0 && (
              <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/30 text-center">
                <p className="text-xs text-muted-foreground">El domiciliario aún debe</p>
                <p className="font-black text-2xl tnum text-red-600">{formatCOP(result.newDebt)}</p>
              </div>
            )}

            {result.creditAmount > 0 && (
              <div className="rounded-xl p-4 bg-amber-500/10 border border-amber-500/30 text-center">
                <p className="text-xs text-muted-foreground">La empresa le debe al domiciliario</p>
                <p className="font-black text-2xl tnum text-amber-600">{formatCOP(result.creditAmount)}</p>
                <p className="text-xs mt-1 font-bold text-amber-700 dark:text-amber-400">
                  Pagar en {result.creditMedium === "cash" ? "💵 efectivo" : "🏦 transferencia"}
                </p>
              </div>
            )}

            {result.newDebt === 0 && result.creditAmount === 0 && (
              <div className="rounded-xl p-4 bg-green-500/10 border border-green-500/30 text-center">
                <p className="font-black text-green-600">✓ Deuda saldada exactamente</p>
              </div>
            )}

            <button onClick={onDone} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition">
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
