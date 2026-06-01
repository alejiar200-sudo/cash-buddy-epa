"use client";

import { useEffect, useState } from "react";
import { Download, Plus, FileSpreadsheet, Lock } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { Branch, MonthlyClose } from "@/lib/sd-api";
import { formatCOP } from "@/lib/format";

export default function ReportesPage() {
  const [closes, setCloses] = useState<MonthlyClose[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [showClose, setShowClose] = useState(false);
  const [closeMonth, setCloseMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [closeBranch, setCloseBranch] = useState("");
  const [closing, setClosing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([api.getCloses(branchId || undefined), api.getBranches()]);
      setCloses(c);
      setBranches(b);
    } catch { toast.error("Error al cargar cierres"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [branchId]);

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setClosing(true);
    try {
      await api.createClose(closeMonth, closeBranch || undefined);
      toast.success(`Cierre de ${closeMonth} generado`);
      setShowClose(false);
      load();
    } catch (err) { toast.error(String(err)); }
    setClosing(false);
  };

  const handleExport = async (month: string, bid?: string) => {
    const key = month + (bid ?? "global");
    setDownloading(key);
    try {
      await api.exportExcel(month, bid || undefined);
      toast.success("Excel descargado");
    } catch (err) { toast.error(String(err)); }
    setDownloading(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Reportes y Cierres Mensuales</h1>
          <p className="text-sm text-muted-foreground">Genera cierres y exporta reportes en Excel</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport(new Date().toISOString().slice(0, 7), branchId || undefined)}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-secondary transition">
            <Download className="h-4 w-4" /> Excel este mes
          </button>
          <button onClick={() => setShowClose(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
            <Lock className="h-4 w-4" /> Cerrar mes
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Cargando...</div>
      ) : closes.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-bold text-lg">Sin cierres aún</p>
          <p className="text-sm text-muted-foreground mt-1">Genera el primer cierre mensual para ver reportes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {closes.map(c => (
            <div key={c.id} className="glass-strong rounded-3xl p-5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-black text-lg">{c.month}</h3>
                  {c.branch ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium">{c.branch.name}</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">Global</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Cerrado el {new Date(c.closedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                <CloseMetric label="Pedidos" value={String(c.totalOrders)} />
                <CloseMetric label="Valor total" value={formatCOP(c.totalValue)} />
                <CloseMetric label="% empresa" value={formatCOP(c.companyTotal)} highlight />
                <CloseMetric label="Bases dadas" value={formatCOP(c.basesGiven)} />
                <CloseMetric label="Bases pagadas" value={formatCOP(c.basesPaid)} />
                <CloseMetric label="Bases pendientes" value={formatCOP(c.basesPending)} warn={c.basesPending > 0} />
              </div>

              <button
                onClick={() => handleExport(c.month, c.branchId ?? undefined)}
                disabled={downloading === c.month + (c.branchId ?? "global")}
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {downloading === c.month + (c.branchId ?? "global") ? "Generando..." : "Exportar Excel"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showClose && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-strong rounded-3xl p-6 w-full max-w-sm space-y-4">
            <h2 className="font-black text-lg">Cerrar mes</h2>
            <p className="text-sm text-muted-foreground">Se calculará el resumen completo del período seleccionado. Esta acción no puede deshacerse.</p>
            <form onSubmit={handleClose} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium">Período (mes)</label>
                <input type="month" value={closeMonth} onChange={e => setCloseMonth(e.target.value)} required
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Sucursal (opcional — vacío = global)</label>
                <select value={closeBranch} onChange={e => setCloseBranch(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
                  <option value="">Global (todas las sucursales)</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowClose(false)} className="flex-1 py-2.5 rounded-xl border border-border hover:bg-secondary transition">Cancelar</button>
                <button type="submit" disabled={closing} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 disabled:opacity-50 transition">
                  {closing ? "Procesando..." : "Generar cierre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CloseMetric({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="bg-secondary/30 rounded-xl p-2.5 min-w-[90px]">
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className={`font-black text-sm tnum mt-0.5 ${highlight ? "text-primary" : warn ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}
