"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { Conversion, Branch } from "@/lib/sd-api";
import { formatCOP } from "@/lib/format";

export default function ConversionesPage() {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ branchId: "", amount: "", type: "banco_a_efectivo" as Conversion["type"], notes: "", date: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        api.getConversions({ branchId: branchId || undefined, from: from || undefined, to: to || undefined }),
        api.getBranches(),
      ]);
      setConversions(c);
      setBranches(b);
      if (!form.branchId && b.length > 0) setForm(f => ({ ...f, branchId: b[0].id }));
    } catch { toast.error("Error al cargar"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [branchId, from, to]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar conversión?")) return;
    try { await api.deleteConversion(id); toast.success("Eliminada"); load(); } catch (err) { toast.error(String(err)); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(form.amount.replace(/\D/g, ""));
    if (!form.branchId || !amount) { toast.error("Completa todos los campos"); return; }
    setSaving(true);
    try {
      await api.createConversion({ branchId: form.branchId, amount, type: form.type, notes: form.notes || undefined, date: form.date || undefined });
      toast.success("Conversión registrada");
      setShowForm(false);
      setForm(f => ({ ...f, amount: "", notes: "", date: "" }));
      load();
    } catch (err) { toast.error(String(err)); }
    setSaving(false);
  };

  const b2e = conversions.filter(c => c.type === "banco_a_efectivo").reduce((s, c) => s + c.amount, 0);
  const e2b = conversions.filter(c => c.type === "efectivo_a_banco").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Conversiones</h1>
          <p className="text-sm text-muted-foreground">Movimientos entre banco y efectivo</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> Nueva conversión
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Banco → Efectivo</p>
          <p className="font-black text-xl tnum text-blue-600 mt-1">{formatCOP(b2e)}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Efectivo → Banco</p>
          <p className="font-black text-xl tnum text-purple-600 mt-1">{formatCOP(e2b)}</p>
        </div>
        <div className="glass-strong rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total conversiones</p>
          <p className="font-black text-xl tnum mt-1">{conversions.length}</p>
        </div>
      </div>

      <div className="glass-strong rounded-3xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase">
              <th className="text-left px-5 py-3">Fecha</th>
              <th className="text-left px-5 py-3">Sucursal</th>
              <th className="text-center px-5 py-3">Tipo</th>
              <th className="text-right px-5 py-3">Monto</th>
              <th className="text-left px-5 py-3">Notas</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Cargando...</td></tr>
            ) : conversions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Sin conversiones registradas</td></tr>
            ) : conversions.map(c => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                <td className="px-5 py-2.5 text-muted-foreground">{new Date(c.date).toLocaleDateString("es-CO")}</td>
                <td className="px-5 py-2.5 text-muted-foreground">{c.branch?.name ?? "—"}</td>
                <td className="px-5 py-2.5 text-center">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold ${c.type === "banco_a_efectivo" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    <ArrowRightLeft className="h-3 w-3" />
                    {c.type === "banco_a_efectivo" ? "Banco → Efectivo" : "Efectivo → Banco"}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right font-bold tnum">{formatCOP(c.amount)}</td>
                <td className="px-5 py-2.5 text-muted-foreground text-xs">{c.notes ?? "—"}</td>
                <td className="px-5 py-2.5">
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-strong rounded-3xl p-6 w-full max-w-sm space-y-4">
            <h2 className="font-black text-lg">Nueva conversión</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium">Sucursal</label>
                <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} required
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Tipo</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Conversion["type"] }))}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
                  <option value="banco_a_efectivo">Banco → Efectivo</option>
                  <option value="efectivo_a_banco">Efectivo → Banco</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Monto</label>
                <input type="text" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="Ej: 200000"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Fecha (opcional)</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Notas</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones..."
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-border hover:bg-secondary transition">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 disabled:opacity-50 transition">
                  {saving ? "..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
