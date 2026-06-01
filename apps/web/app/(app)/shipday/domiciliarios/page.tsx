"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { Driver, Branch } from "@/lib/sd-api";
import { formatCOP } from "@/lib/format";

export default function DomiciliariosShipdayPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Driver | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([api.getDrivers(branchId || undefined), api.getBranches()]);
      setDrivers(d);
      setBranches(b);
    } catch { toast.error("Error al cargar"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [branchId]);

  const withDebt = drivers.filter(d => d.pendingDebt > 0);
  const withoutDebt = drivers.filter(d => d.pendingDebt === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Domiciliarios Shipday</h1>
          <p className="text-sm text-muted-foreground">{drivers.length} domiciliarios · {withDebt.length} con deuda pendiente</p>
        </div>
        <div className="flex gap-2">
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
          >
            <option value="">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-secondary transition">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Cargando...</div>
      ) : (
        <div className="glass-strong rounded-3xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs uppercase">
                <th className="text-left px-5 py-3">Domiciliario</th>
                <th className="text-left px-5 py-3">Sucursal</th>
                <th className="text-left px-5 py-3">Teléfono</th>
                <th className="text-right px-5 py-3">Deuda pendiente</th>
                <th className="text-center px-5 py-3">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                  <td className="px-5 py-3 font-medium">{d.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{d.branch.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{d.phone ?? "—"}</td>
                  <td className={`px-5 py-3 text-right font-bold tnum ${d.pendingDebt > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {d.pendingDebt > 0 ? formatCOP(d.pendingDebt) : "—"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${d.active ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>
                      {d.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setSelected(d)}
                      className="text-xs text-primary font-bold hover:underline"
                    >
                      Ver estado de cuenta
                    </button>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    No hay domiciliarios. Sincroniza una sucursal primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {withDebt.length > 0 && (
        <div className="glass-strong rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h3 className="font-bold text-red-600">Domiciliarios con deuda</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {withDebt.map(d => (
              <button
                key={d.id}
                onClick={() => setSelected(d)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100 transition"
              >
                {d.name} · <span className="tnum">{formatCOP(d.pendingDebt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <DriverStatementModal driver={selected} onClose={() => setSelected(null)} onRefresh={load} />
      )}
    </div>
  );
}

function DriverStatementModal({ driver, onClose, onRefresh }: { driver: Driver; onClose: () => void; onRefresh: () => void }) {
  const [statement, setStatement] = useState<api.DriverStatement | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api.getDriverStatement(driver.id).then(setStatement).catch(() => toast.error("Error al cargar estado de cuenta"));
  }, [driver.id]);

  const handlePay = async () => {
    const amount = parseInt(payAmount.replace(/\D/g, ""));
    if (!amount || amount <= 0) { toast.error("Ingresa un monto válido"); return; }
    setPaying(true);
    try {
      await api.registerPayment(driver.id, amount, "Pago de porcentaje");
      toast.success(`Pago de ${formatCOP(amount)} registrado`);
      setPayAmount("");
      onRefresh();
      const s = await api.getDriverStatement(driver.id);
      setStatement(s);
    } catch (err) { toast.error(String(err)); }
    setPaying(false);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Estado de cuenta — {driver.name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {!statement ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total pedidos" value={String(statement.totalOrders)} />
              <Stat label="Valor total" value={formatCOP(statement.totalValue)} />
              <Stat label="% empresa (30%)" value={formatCOP(statement.totalCompany)} />
              <Stat label="Deuda pendiente" value={formatCOP(statement.pendingDebt)} highlight={statement.pendingDebt > 0} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Bases entregadas" value={formatCOP(statement.totalBasesGiven)} />
              <Stat label="Bases pagadas" value={formatCOP(statement.totalBasesPaid)} />
            </div>

            {statement.pendingDebt > 0 && (
              <div className="bg-red-50 rounded-2xl p-4 space-y-3">
                <p className="font-bold text-red-700">Registrar pago de porcentaje</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej: 50000"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
                  />
                  <button onClick={handlePay} disabled={paying} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 disabled:opacity-50 transition">
                    {paying ? "..." : "Registrar pago"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Últimos 10 pedidos</h3>
              <div className="space-y-1">
                {statement.orders.slice(0, 10).map(o => (
                  <div key={o.id} className="flex justify-between text-sm py-1.5 px-3 rounded-lg bg-secondary/30">
                    <span className="text-muted-foreground">{o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString("es-CO") : "—"} · #{o.orderNumber ?? "—"}</span>
                    <div className="flex gap-4 tnum">
                      <span>{formatCOP(o.deliveryValue)}</span>
                      <span className="text-red-600 font-bold">-{formatCOP(o.companyAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-secondary/40 rounded-2xl p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-black text-lg tnum ${highlight ? "text-red-600" : ""}`}>{value}</p>
    </div>
  );
}
