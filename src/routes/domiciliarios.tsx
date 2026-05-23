import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, courierStatusForDay, deliveriesForDay, type Worker } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { Avatar } from "@/components/Avatar";
import { formatCOP } from "@/lib/format";
import { GiveBaseWizard } from "@/components/wizards/GiveBaseWizard";
import { RegisterDeliveryWizard } from "@/components/wizards/RegisterDeliveryWizard";
import { ReceiveDeliveryPaymentWizard } from "@/components/wizards/ReceiveDeliveryPaymentWizard";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, Package, MoreVertical, Banknote, CheckCircle2, Eye, Pencil, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/domiciliarios")({ component: CouriersPage });

function CouriersPage() {
  const { state, addWorker } = useStore();
  const { date } = useDay();
  const couriers = state.workers.filter((w) => w.active && w.role === "domiciliario");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🛵 Domiciliarios</h1>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl shadow-cash">
          <Plus className="h-4 w-4" /> Agregar domiciliario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {couriers.map((w) => <CourierCard key={w.id} worker={w} date={date} />)}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="glass-strong rounded-3xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-3">Nuevo domiciliario</h3>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" className="w-full glass rounded-xl px-4 py-3 outline-none" />
            <button
              onClick={() => {
                if (newName.trim()) {
                  addWorker({ name: newName.trim(), role: "domiciliario", active: true });
                  setNewName(""); setAdding(false);
                }
              }}
              className="mt-4 w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-cash"
            >Agregar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CourierCard({ worker, date }: { worker: Worker; date: string }) {
  const { getDay } = useStore();
  const day = getDay(date);
  const s = courierStatusForDay(day, worker.id);
  const deliveries = deliveriesForDay(day, worker.id);

  const [giveBase, setGiveBase] = useState(false);
  const [regDel, setRegDel] = useState(false);
  const [receive, setReceive] = useState(false);
  const [receivePreset, setReceivePreset] = useState<string | undefined>();

  const toneCls =
    s.status === "ok" ? "ring-cash shadow-cash"
    : s.status === "debt" ? "ring-1 ring-danger/40 shadow-danger"
    : s.status === "partial" ? "ring-1 ring-warn/40 shadow-warn"
    : "";
  const stateLabel = {
    ok: { txt: "✅ Al día", cls: "text-cash bg-cash-soft" },
    debt: { txt: "⚠️ Debe", cls: "text-danger bg-danger-soft" },
    partial: { txt: "⏳ Parcial", cls: "text-warn bg-warn-soft" },
    idle: { txt: "○ Sin actividad", cls: "text-muted-foreground bg-secondary" },
  }[s.status];

  const totalReceived = deliveries.filter((d) => d.received).reduce((sum, d) => sum + d.value, 0);
  const totalOwed = deliveries.filter((d) => !d.received).reduce((sum, d) => sum + d.value, 0);

  function openReceive(deliveryId?: string) {
    setReceivePreset(deliveryId);
    setReceive(true);
  }

  return (
    <div className={`glass-strong rounded-3xl p-5 ${toneCls}`}>
      <div className="flex items-center gap-3">
        <Avatar worker={worker} size={48} />
        <div className="flex-1">
          <div className="text-lg font-bold">{worker.name}</div>
          <div className={`inline-flex text-xs font-bold px-2.5 py-1 rounded-full mt-1 ${stateLabel.cls}`}>{stateLabel.txt}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Base" value={s.baseGiven} />
        <Stat label="Domicilios" value={deliveries.length} raw />
        <Stat label="Recibido" value={totalReceived} accent />
      </div>

      {/* Today's deliveries */}
      {deliveries.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Domicilios de hoy</div>
          <div className="space-y-1 max-h-40 overflow-auto pr-1">
            {deliveries.map((d) => (
              <div
                key={d.movement.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm ${d.received ? "bg-cash-soft" : "bg-danger-soft"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="tnum font-bold">{formatCOP(d.value)}</span>
                  <span className={d.received ? "text-cash text-xs" : "text-danger text-xs"}>
                    {d.received ? "✅ Recibido" : "⚠️ Debe"}
                  </span>
                </div>
                {!d.received && (
                  <button
                    onClick={() => openReceive(d.movement.id)}
                    className="text-xs font-bold px-2 py-1 rounded-md bg-cash text-background"
                  >
                    ✅ Recibir
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs tnum">
            <span className="text-muted-foreground">Total recibido</span>
            <span className="font-bold text-cash">{formatCOP(totalReceived)}</span>
          </div>
          {totalOwed > 0 && (
            <div className="flex items-center justify-between text-xs tnum">
              <span className="text-muted-foreground">Total que debe</span>
              <span className="font-bold text-danger">{formatCOP(totalOwed)}</span>
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setRegDel(true)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl shadow-cash text-sm"
        >
          <Package className="h-4 w-4" /> Registrar domicilio
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="px-3 py-2.5 rounded-xl bg-secondary text-sm font-medium" title="Más opciones">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            <DropdownMenuItem onClick={() => setGiveBase(true)} className="gap-2">
              <Banknote className="h-4 w-4" /> 💵 Dar base
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openReceive(undefined)} disabled={totalOwed === 0} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> ✅ Recibir pago domicilio
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" disabled>
              <Eye className="h-4 w-4" /> 💼 Ver historial
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" disabled>
              <Pencil className="h-4 w-4" /> ✏️ Editar trabajador
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {s.baseGiven === 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" /> Aún no le has dado base hoy
        </div>
      )}

      <GiveBaseWizard open={giveBase} onOpenChange={setGiveBase} date={date} presetWorkerId={worker.id} />
      <RegisterDeliveryWizard open={regDel} onOpenChange={setRegDel} date={date} workerId={worker.id} />
      <ReceiveDeliveryPaymentWizard
        open={receive}
        onOpenChange={(v) => { setReceive(v); if (!v) setReceivePreset(undefined); }}
        date={date}
        workerId={worker.id}
        presetDeliveryId={receivePreset}
      />
    </div>
  );
}

function Stat({ label, value, accent, raw }: { label: string; value: number; accent?: boolean; raw?: boolean }) {
  return (
    <div className="glass rounded-xl py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`tnum text-sm font-bold ${accent ? "text-cash" : ""}`}>
        {raw ? value : formatCOP(value)}
      </div>
    </div>
  );
}
