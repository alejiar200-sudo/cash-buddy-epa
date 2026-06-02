"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Plus, Copy, Webhook, Info } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { Order, Branch, Driver } from "@/lib/sd-api";
import { formatCOP } from "@/lib/format";
import { LiveBadge } from "@/components/LiveBadge";

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  const load = async () => {
    const [b, d] = await Promise.all([api.getBranches(), api.getDrivers()]);
    setBranches(b);
    setDrivers(d);
    if (!branchId && b.length > 0) {
      setBranchId(b[0].id);
      return;
    }
    if (!branchId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.getOrdersByBranch(branchId, from || undefined, to || undefined);
      setOrders(data);
    } catch { toast.error("Error al cargar pedidos"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (branchId) { setLoading(true); api.getOrdersByBranch(branchId, from || undefined, to || undefined).then(setOrders).catch(() => toast.error("Error")).finally(() => setLoading(false)); } }, [branchId, from, to]);
  useEffect(() => { if (branchId) { api.getDrivers(branchId).then(setDrivers); } }, [branchId]);

  // Refresco en vivo cada 3s (solo orders, sin spinner ni toasts)
  useEffect(() => {
    if (!branchId) return;
    const t = setInterval(() => {
      api.getOrdersByBranch(branchId, from || undefined, to || undefined).then(setOrders).catch(() => {});
    }, 3_000);
    return () => clearInterval(t);
  }, [branchId, from, to]);

  const totalValue = orders.reduce((s, o) => s + o.deliveryValue, 0);
  const totalCompany = orders.reduce((s, o) => s + o.companyAmount, 0);
  const currentBranch = branches.find(b => b.id === branchId);

  // Orden ascendente por el número real de pedido de Shipday (numérico cuando se puede).
  const sortedOrders = [...orders].sort((a, b) => {
    const an = a.orderNumber ?? "";
    const bn = b.orderNumber ?? "";
    const ai = parseInt(an, 10);
    const bi = parseInt(bn, 10);
    const aIsNum = !Number.isNaN(ai);
    const bIsNum = !Number.isNaN(bi);
    if (aIsNum && bIsNum) return ai - bi;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return an.localeCompare(bn);
  });

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000/api/webhooks/shipday/${branchId}`
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black">Pedidos entregados</h1>
            <LiveBadge />
          </div>
          <p className="text-sm text-muted-foreground">{orders.length} pedidos · {formatCOP(totalValue)} total · {formatCOP(totalCompany)} empresa</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowWebhook(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm hover:bg-secondary transition">
            <Webhook className="h-4 w-4" /> Webhook
          </button>
          <button onClick={() => setShowManual(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
            <Plus className="h-4 w-4" /> Registrar pedido
          </button>
          <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-secondary transition">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
      </div>

      {/* Banner informativo sobre webhooks si no hay pedidos */}
      {!loading && orders.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-bold">¿No ves tus pedidos de Shipday?</p>
            <p className="mt-1">La API de Shipday solo devuelve pedidos creados por API. Para recibir <strong>todos los pedidos</strong> del dashboard de Shipday en tiempo real, configura el <strong>Webhook</strong> (botón arriba). También puedes registrarlos manualmente con <strong>"Registrar pedido"</strong>.</p>
          </div>
        </div>
      )}

      <div className="glass-strong rounded-3xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase">
              <th className="text-left px-4 py-3"># Pedido</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Domiciliario</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-right px-4 py-3">Valor</th>
              <th className="text-right px-4 py-3">% empresa</th>
              <th className="text-center px-4 py-3">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Cargando...</td></tr>
            ) : sortedOrders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Sin pedidos — registra uno manualmente o configura el webhook</td></tr>
            ) : sortedOrders.map(o => (
              <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                <td className="px-4 py-2.5 font-bold tnum">#{o.orderNumber ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {o.deliveredAt ? new Date(o.deliveredAt).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td className="px-4 py-2.5 font-medium">{o.driver?.name ?? <span className="text-muted-foreground italic">Sin asignar</span>}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{o.customerName ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-bold tnum">{formatCOP(o.deliveryValue)}</td>
                <td className="px-4 py-2.5 text-right font-bold tnum text-primary">{formatCOP(o.companyAmount)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${o.shipdayOrderId?.startsWith("manual-") ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    {o.shipdayOrderId?.startsWith("manual-") ? "Manual" : "Shipday"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal registro manual */}
      {showManual && (
        <ManualOrderModal
          branches={branches}
          drivers={drivers.filter(d => !branchId || d.branchId === branchId)}
          defaultBranchId={branchId}
          onClose={() => setShowManual(false)}
          onSaved={() => { setShowManual(false); load(); }}
        />
      )}

      {/* Modal webhook */}
      {showWebhook && currentBranch && (
        <WebhookModal branch={currentBranch} webhookUrl={webhookUrl} onClose={() => setShowWebhook(false)} />
      )}
    </div>
  );
}

function ManualOrderModal({ branches, drivers, defaultBranchId, onClose, onSaved }: {
  branches: Branch[]; drivers: Driver[]; defaultBranchId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ branchId: defaultBranchId, driverId: "", deliveryValue: "", orderNumber: "", customerName: "" });
  const [saving, setSaving] = useState(false);
  const commission = form.deliveryValue ? Math.round(parseInt(form.deliveryValue.replace(/\D/g, "") || "0") * 0.3) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const deliveryValue = parseInt(form.deliveryValue.replace(/\D/g, ""));
    if (!form.branchId || !deliveryValue) { toast.error("Sucursal y valor son requeridos"); return; }
    setSaving(true);
    try {
      await api.createManualOrder({
        branchId: form.branchId,
        driverId: form.driverId || undefined,
        deliveryValue,
        orderNumber: form.orderNumber || undefined,
        customerName: form.customerName || undefined,
      });
      toast.success("Pedido registrado correctamente");
      onSaved();
    } catch (err) { toast.error(String(err)); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-6 w-full max-w-md space-y-4">
        <h2 className="font-black text-lg">Registrar pedido manualmente</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Sucursal *</label>
            <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} required
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Domiciliario</label>
            <select value={form.driverId} onChange={e => setForm(f => ({ ...f, driverId: e.target.value }))}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm">
              <option value="">Sin asignar</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Valor del domicilio *</label>
            <input type="text" value={form.deliveryValue} onChange={e => setForm(f => ({ ...f, deliveryValue: e.target.value }))} required
              placeholder="Ej: 15000" className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            {commission > 0 && (
              <p className="text-xs text-primary mt-1 font-bold">→ 30% empresa: {formatCOP(commission)}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium"># Pedido</label>
              <input type="text" value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))}
                placeholder="Opcional" className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Cliente</label>
              <input type="text" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="Opcional" className="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border hover:bg-secondary transition">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 disabled:opacity-50 transition">
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WebhookModal({ branch, webhookUrl, onClose }: { branch: Branch; webhookUrl: string; onClose: () => void }) {
  const copy = () => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); };
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-6 w-full max-w-lg space-y-4">
        <h2 className="font-black text-lg">Configurar Webhook — {branch.name}</h2>
        <p className="text-sm text-muted-foreground">
          Configura esta URL en Shipday para recibir pedidos en tiempo real cuando cambien a estado <strong>DELIVERED</strong>.
        </p>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">URL del webhook</label>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2.5 rounded-xl bg-secondary text-xs font-mono break-all">{webhookUrl}</code>
            <button onClick={copy} className="p-2.5 rounded-xl border border-border hover:bg-secondary transition shrink-0">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4 space-y-2 text-sm text-blue-900">
          <p className="font-bold">Cómo configurarlo en Shipday:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Entra a <strong>app.shipday.com</strong></li>
            <li>Ve a <strong>Settings → Integrations → Webhooks</strong></li>
            <li>Agrega la URL del webhook de arriba</li>
            <li>Selecciona el evento <strong>"Order Delivered"</strong></li>
            <li>Guarda los cambios</li>
          </ol>
        </div>

        <div className="bg-orange-50 rounded-2xl p-4 text-sm text-orange-900">
          <p className="font-bold">⚠ El servidor debe ser accesible desde internet</p>
          <p className="mt-1">Si usas Tailscale, reemplaza <code className="bg-orange-100 px-1 rounded">192.168.x.x</code> por tu IP de Tailscale (<code className="bg-orange-100 px-1 rounded">100.x.x.x</code>). El puerto debe ser <strong>4000</strong> o el que configures.</p>
        </div>

        <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-border hover:bg-secondary transition">Cerrar</button>
      </div>
    </div>
  );
}

