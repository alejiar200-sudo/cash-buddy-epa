"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { Driver, Branch, BaseTransaction } from "@/lib/sd-api";
import { formatCOP } from "@/lib/format";

export default function BasesPage() {
  const [bases, setBases] = useState<BaseTransaction[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<"give" | "pay" | null>(null);
  const [formDriver, setFormDriver] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, d, br] = await Promise.all([
        api.getBases(branchId ? { branchId } : {}),
        api.getDrivers(branchId || undefined),
        api.getBranches(),
      ]);
      setBases(b);
      setDrivers(d);
      setBranches(br);
    } catch { toast.error("Error al cargar"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(formAmount.replace(/\D/g, ""));
    if (!formDriver || !amount) { toast.error("Selecciona domiciliario e ingresa monto"); return; }
    setSaving(true);
    try {
      if (showForm === "give") await api.giveBase(formDriver, amount, formNotes || undefined);
      else await api.payBase(formDriver, amount, formNotes || undefined);
      toast.success(showForm === "give" ? "Base entregada registrada" : "Pago de base registrado");
      setShowForm(null);
      setFormDriver(""); setFormAmount(""); setFormNotes("");
      load();
    } catch (err) { toast.error(String(err)); }
    setSaving(false);
  };

  const totalGiven = bases.filter(b => b.type === "entrega").reduce((s, b) => s + b.amount, 0);
  const totalPaid = bases.filter(b => b.type === "pago").reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Bases</h1>
          <p className="text-sm text-muted-foreground">Control de dinero base entregado a domiciliarios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm("give")} className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition">
            <Plus className="h-4 w-4" /> Entregar base
          </button>
          <button onClick={() => setShowForm("pay")} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition">
            <Plus className="h-4 w-4" /> Registrar pago
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-secondary transition"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total entregado</p>
          <p className="font-black text-xl tnum text-orange-500 mt-1">{formatCOP(totalGiven)}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total pagado</p>
          <p className="font-black text-xl tnum text-green-600 mt-1">{formatCOP(totalPaid)}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className={`font-black text-xl tnum mt-1 ${totalGiven - totalPaid > 0 ? "text-red-500" : "text-muted-foreground"}`}>{formatCOP(totalGiven - totalPaid)}</p>
        </div>
      </div>

      <div className="glass-strong rounded-3xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase">
              <th className="text-left px-5 py-3">Fecha</th>
              <th className="text-left px-5 py-3">Domiciliario</th>
              <th className="text-left px-5 py-3">Sucursal</th>
              <th className="text-center px-5 py-3">Tipo</th>
              <th className="text-right px-5 py-3">Monto</th>
              <th className="text-left px-5 py-3">Notas</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Cargando...</td></tr>
            ) : bases.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Sin registros de bases</td></tr>
            ) : bases.map(b => (
              <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                <td className="px-5 py-2.5 text-muted-foreground">{new Date(b.date).toLocaleDateString("es-CO")}</td>
                <td className="px-5 py-2.5 font-medium">{b.driver?.name ?? "—"}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{b.branch?.name ?? "—"}</td>
                <td className="px-5 py-2.5 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${b.type === "entrega" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    {b.type === "entrega" ? "Entrega" : "Pago"}
                  </span>
                </td>
                <td className={`px-5 py-2.5 text-right font-bold tnum ${b.type === "entrega" ? "text-orange-600" : "text-green-600"}`}>
                  {b.type === "entrega" ? "-" : "+"}{formatCOP(b.amount)}
                </td>
                <td className="px-5 py-2.5 text-muted-foreground text-xs">{b.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-strong rounded-3xl p-6 w-full max-w-sm space-y-4">
            <h2 className="font-black text-lg">{showForm === "give" ? "Entregar base" : "Registrar pago de base"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium">Domiciliario</label>
                <select value={formDriver} onChange={e => setFormDriver(e.target.value)} required
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
                  <option value="">Seleccionar...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.branch.name})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Monto</label>
                <input type="text" value={formAmount} onChange={e => setFormAmount(e.target.value)} required placeholder="Ej: 100000"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Notas (opcional)</label>
                <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Observaciones..."
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(null)} className="flex-1 py-2.5 rounded-xl border border-border hover:bg-secondary transition">Cancelar</button>
                <button type="submit" disabled={saving}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-white transition disabled:opacity-50 ${showForm === "give" ? "bg-orange-500 hover:bg-orange-600" : "bg-green-600 hover:bg-green-700"}`}>
                  {saving ? "..." : showForm === "give" ? "Entregar" : "Registrar pago"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
