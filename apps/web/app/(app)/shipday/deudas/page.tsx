"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { DriverDebt, Branch } from "@/lib/sd-api";
import { formatCOP } from "@/lib/format";
import { DriverStatementModal } from "@/components/DriverStatementModal";
import { LiveBadge } from "@/components/LiveBadge";

export default function DeudasPage() {
  const [debtors, setDebtors] = useState<DriverDebt[]>([]);
  const [creditors, setCreditors] = useState<DriverDebt[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriverDebt | null>(null);

  function parseResponse(raw: unknown) {
    if (!raw || typeof raw !== "object") return { debtors: [], creditors: [] };
    if (Array.isArray(raw)) return { debtors: raw as DriverDebt[], creditors: [] };
    const r = raw as { debtors?: DriverDebt[]; creditors?: DriverDebt[] };
    return { debtors: r.debtors ?? [], creditors: r.creditors ?? [] };
  }

  const load = async () => {
    setLoading(true);
    try {
      const [raw, b] = await Promise.all([api.getDebtsDashboard(branchId || undefined), api.getBranches()]);
      const { debtors: d, creditors: c } = parseResponse(raw);
      setDebtors(d);
      setCreditors(c);
      setBranches(b);
    } catch { toast.error("Error al cargar deudas"); }
    setLoading(false);
  };

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    const t = setInterval(() => {
      api.getDebtsDashboard(branchId || undefined).then(raw => {
        const { debtors: d, creditors: c } = parseResponse(raw);
        setDebtors(d); setCreditors(c);
      }).catch(() => {});
    }, 12_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const totalDebt = (debtors ?? []).reduce((s, d) => s + (d.pendingDebt ?? 0), 0);
  const totalCredit = (creditors ?? []).reduce((s, d) => s + (d.creditAmount ?? 0), 0);
  const highDebt = (debtors ?? []).filter(d => d.pendingDebt > 100000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black">Dashboard de Deudas</h1>
            <LiveBadge />
          </div>
          <p className="text-sm text-muted-foreground">{debtors.length} domiciliarios con deuda · {formatCOP(totalDebt)} total pendiente</p>
        </div>
        <div className="flex gap-2">
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
            <option value="">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-secondary transition"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {highDebt.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-bold text-red-700 dark:text-red-400">Deudas altas (más de $100.000)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {highDebt.map(d => (
              <span key={d.id} className="px-3 py-1.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-sm font-bold">
                {d.name} · {formatCOP(d.pendingDebt)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total deuda (ellos deben)</p>
          <p className="font-black text-2xl tnum text-red-500 mt-1">{formatCOP(totalDebt)}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Domiciliarios con deuda</p>
          <p className="font-black text-2xl tnum mt-1">{debtors.length}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total crédito (empresa debe)</p>
          <p className="font-black text-2xl tnum text-amber-500 mt-1">{formatCOP(totalCredit)}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Deuda alta (&gt;$100k)</p>
          <p className={`font-black text-2xl tnum mt-1 ${highDebt.length > 0 ? "text-red-500" : ""}`}>{highDebt.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Cargando...</div>
      ) : (
        <div className="space-y-6">
          {/* Domiciliarios que deben a la empresa — ROJO */}
          {debtors.length > 0 && (
            <div className="glass-strong rounded-3xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-red-500/5 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                <span className="font-bold text-sm">Domiciliarios que deben a la empresa</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs uppercase">
                    <th className="text-left px-5 py-3">Pos.</th>
                    <th className="text-left px-5 py-3">Domiciliario</th>
                    <th className="text-left px-5 py-3">Sucursal</th>
                    <th className="text-right px-5 py-3">Deuda pendiente</th>
                    <th className="text-center px-5 py-3">Nivel</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d, i) => {
                    const level = d.pendingDebt > 200000 ? "crítico" : d.pendingDebt > 100000 ? "alto" : d.pendingDebt > 50000 ? "medio" : "bajo";
                    const levelStyle = { crítico: "bg-red-200 text-red-800", alto: "bg-red-100 text-red-700", medio: "bg-orange-100 text-orange-700", bajo: "bg-yellow-100 text-yellow-700" }[level];
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                        <td className="px-5 py-3 font-bold text-muted-foreground">#{i + 1}</td>
                        <td className="px-5 py-3 font-bold">{d.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{d.branch.name}</td>
                        <td className="px-5 py-3 text-right font-black tnum text-red-600 text-base">{formatCOP(d.pendingDebt)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${levelStyle}`}>{level}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => setSelected(d)} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition">
                            Registrar pago
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Domiciliarios a quienes la empresa debe — AMARILLO */}
          {creditors.length > 0 && (
            <div className="glass-strong rounded-3xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-amber-500/5 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                <span className="font-bold text-sm">La empresa debe a estos domiciliarios</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs uppercase">
                    <th className="text-left px-5 py-3">Domiciliario</th>
                    <th className="text-left px-5 py-3">Sucursal</th>
                    <th className="text-right px-5 py-3">A pagar</th>
                    <th className="text-center px-5 py-3">Medio de pago</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {creditors.map(d => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                      <td className="px-5 py-3 font-bold">{d.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{d.branch.name}</td>
                      <td className="px-5 py-3 text-right font-black tnum text-amber-600 text-base">{formatCOP(d.creditAmount)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${d.creditMedium === "cash" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                          {d.creditMedium === "cash" ? "💵 Efectivo" : "🏦 Transferencia"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setSelected(d)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:opacity-90 transition">
                          Ver estado
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {debtors.length === 0 && creditors.length === 0 && (
            <div className="glass-strong rounded-3xl p-12 text-center">
              <p className="font-bold text-lg text-green-600">¡Sin deudas pendientes!</p>
              <p className="text-sm text-muted-foreground mt-1">Todos los domiciliarios están al día</p>
            </div>
          )}
        </div>
      )}

      {selected && (
        <DriverStatementModal
          driver={{ id: selected.id, name: selected.name, branch: selected.branch }}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
