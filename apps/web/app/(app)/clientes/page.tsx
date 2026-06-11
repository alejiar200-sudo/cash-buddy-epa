"use client";

import { useEffect, useState } from "react";
import { Users, Plus, AlertTriangle, CheckCircle2, Trash2, ChevronDown, ChevronUp, Bell } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import { ClientDebtWizard } from "@/components/wizards/ClientDebtWizard";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/use-live";

function formatCOP(n: number) {
  return "$" + n.toLocaleString("es-CO");
}

export default function ClientesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [clients, setClients] = useState<api.Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [wizardMode, setWizardMode] = useState<"new_client" | "add_debt" | "pay_debt" | null>(null);
  const [selectedClient, setSelectedClient] = useState<api.Client | undefined>();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getClients();
      setClients(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
    } catch { if (!silent) toast.error("Error al cargar clientes"); }
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useLive(() => load(true), 5000);

  const debtors = clients.filter(c => c.pendingDebt > 0);
  const totalDebt = debtors.reduce((s, c) => s + c.pendingDebt, 0);

  function openAddDebt(c: api.Client) { setSelectedClient(c); setWizardMode("add_debt"); }
  function openPayClient(c: api.Client) { setSelectedClient(c); setWizardMode("pay_debt"); }

  async function removeClient(c: api.Client) {
    if (!confirm(`¿Eliminar al cliente "${c.name}"? Esta acción no se puede deshacer y borra su historial de deudas.`)) return;
    try {
      await api.deleteClient(c.id);
      toast.success(`Cliente "${c.name}" eliminado`);
      load();
    } catch (err) { toast.error(String(err)); }
  }

  async function notifyDebtors() {
    if (debtors.length === 0) { toast.info("No hay clientes con deudas pendientes"); return; }

    let opened = 0;
    for (const c of debtors) {
      if (!c.phone) continue;
      const phone = c.phone.replace(/\D/g, "");
      const fullPhone = phone.startsWith("57") ? phone : `57${phone}`;
      const msg = encodeURIComponent(
        `Hola ${c.name} 👋, te recordamos que tienes un saldo pendiente de $${c.pendingDebt.toLocaleString("es-CO")} con nosotros. Por favor comunícate para ponernos al día. ¡Gracias!`
      );
      window.open(`https://wa.me/${fullPhone}?text=${msg}`, "_blank");
      opened++;
      // pequeño delay para no saturar el navegador
      await new Promise(r => setTimeout(r, 400));
    }

    const sinTelefono = debtors.filter(c => !c.phone).length;
    if (opened > 0) toast.success(`📲 WhatsApp abierto para ${opened} cliente(s)`);
    if (sinTelefono > 0) toast.warning(`⚠️ ${sinTelefono} cliente(s) sin teléfono registrado`);
    if (opened === 0) toast.error("Ningún cliente deudor tiene teléfono registrado");
  }

  async function toggleActive(c: api.Client) {
    try {
      await api.updateClient(c.id, { active: !c.active });
      toast.success(c.active ? "Cliente desactivado" : "Cliente reactivado");
      load();
    } catch (err) { toast.error(String(err)); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gestión de deudas y saldos pendientes</p>
        </div>
        <div className="flex gap-2">
          {debtors.length > 0 && (
            <button
              onClick={notifyDebtors}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-secondary transition"
            >
              <Bell className="h-4 w-4" />
              Notificar deudores ({debtors.length})
            </button>
          )}
          <button
            onClick={() => { setSelectedClient(undefined); setWizardMode("new_client"); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" /> Nuevo cliente
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {debtors.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SummaryCard icon="👥" label="Total clientes" value={String(clients.length)} />
          <SummaryCard icon="⚠️" label="Con deuda" value={String(debtors.length)} warn />
          <SummaryCard icon="💸" label="Deuda total" value={formatCOP(totalDebt)} warn />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Cargando…</div>
      ) : clients.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-bold text-lg">Sin clientes aún</p>
          <p className="text-sm text-muted-foreground mt-1">Registra el primer cliente para comenzar</p>
          <button onClick={() => setWizardMode("new_client")} className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
            Registrar cliente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(c => {
            const expanded = expandedId === c.id;
            const unpaidDebts = c.debts.filter(d => !d.paid);
            return (
              <div key={c.id} className={`glass-strong rounded-3xl overflow-hidden ${!c.active ? "opacity-60" : ""}`}>
                <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${c.pendingDebt > 0 ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}`}>
                      {c.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {c.name}
                        {!c.active && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">Inactivo</span>}
                      </div>
                      {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.pendingDebt > 0 ? (
                      <div className="text-right">
                        <div className="text-xs text-red-500 font-medium">Deuda pendiente</div>
                        <div className="font-black text-red-600 tnum">{formatCOP(c.pendingDebt)}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Al día
                      </div>
                    )}
                    <button
                      onClick={() => openAddDebt(c)}
                      className="px-3 py-1.5 text-xs font-bold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition"
                    >
                      + Deuda
                    </button>
                    <button
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                      className="p-1.5 rounded-lg hover:bg-secondary transition"
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
                    {/* Abono al saldo total del cliente */}
                    {c.pendingDebt > 0 && (
                      <button
                        onClick={() => openPayClient(c)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition"
                      >
                        <span className="text-sm font-bold text-green-700 dark:text-green-400">💵 Abonar / Pagar deuda</span>
                        <span className="text-xs text-muted-foreground">Saldo: <span className="font-bold text-red-500">{formatCOP(c.pendingDebt)}</span></span>
                      </button>
                    )}

                    {unpaidDebts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">Sin deudas pendientes</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Detalle de deudas</p>
                        {unpaidDebts.map(d => {
                          const pendingOnDebt = d.amount - (d.paidAmount ?? 0);
                          return (
                          <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                            <div>
                              <p className="text-sm font-medium">{d.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(d.createdAt).toLocaleDateString("es-CO")}
                                {(d.paidAmount ?? 0) > 0 ? ` · abonado ${formatCOP(d.paidAmount ?? 0)}` : ""}
                              </p>
                            </div>
                            <span className="font-bold text-red-600 tnum">{formatCOP(pendingOnDebt)}</span>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {c.debts.filter(d => d.paid).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial pagado</p>
                        {c.debts.filter(d => d.paid).slice(0, 3).map(d => (
                          <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                            <div>
                              <p className="text-sm font-medium line-through opacity-60">{d.description}</p>
                              <p className="text-xs text-muted-foreground">{d.paidAt ? new Date(d.paidAt).toLocaleDateString("es-CO") : ""}</p>
                            </div>
                            <span className="text-sm text-green-600 font-medium">✓ Pagado</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button onClick={() => toggleActive(c)} className="flex-1 py-2 text-xs font-bold border border-border rounded-xl hover:bg-secondary transition">
                        {c.active ? "Desactivar" : "Reactivar"}
                      </button>
                      {isAdmin && (
                        <button onClick={() => removeClient(c)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold border border-red-500/30 text-red-500 rounded-xl hover:bg-red-500/10 transition">
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {wizardMode === "new_client" && (
        <ClientDebtWizard open={true} onOpenChange={(v) => { if (!v) setWizardMode(null); }} mode="new_client" onDone={load} />
      )}
      {wizardMode === "add_debt" && selectedClient && (
        <ClientDebtWizard open={true} onOpenChange={(v) => { if (!v) setWizardMode(null); }} mode="add_debt" client={selectedClient} onDone={load} />
      )}
      {wizardMode === "pay_debt" && selectedClient && (
        <ClientDebtWizard open={true} onOpenChange={(v) => { if (!v) setWizardMode(null); }} mode="pay_debt" client={selectedClient} onDone={load} />
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, warn }: { icon: string; label: string; value: string; warn?: boolean }) {
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-2xl">{icon}</div>
      <div className="text-xs text-muted-foreground mt-2">{label}</div>
      <div className={`font-black text-xl tnum mt-0.5 ${warn ? "text-red-500" : ""}`}>{value}</div>
    </div>
  );
}
