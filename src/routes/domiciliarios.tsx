import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, courierStatusForDay, type Worker } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { Avatar } from "@/components/Avatar";
import { formatCOP } from "@/lib/format";
import { GiveBaseWizard } from "@/components/wizards/GiveBaseWizard";
import { RegisterDeliveriesWizard } from "@/components/wizards/RegisterDeliveriesWizard";
import { CourierPaidWizard } from "@/components/wizards/CourierPaidWizard";
import { Plus, Banknote, Package, CheckCircle2, Pencil, Eye } from "lucide-react";

export const Route = createFileRoute("/domiciliarios")({ component: CouriersPage });

function CouriersPage() {
  const { state, addWorker } = useStore();
  const { date } = useDay();
  const couriers = state.workers.filter(w => w.active && w.role === "domiciliario");
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
        {couriers.map(w => <CourierCard key={w.id} worker={w} date={date} />)}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="glass-strong rounded-3xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-3">Nuevo domiciliario</h3>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" className="w-full glass rounded-xl px-4 py-3 outline-none" />
            <button onClick={() => { if (newName.trim()) { addWorker({ name: newName.trim(), role: "domiciliario", active: true }); setNewName(""); setAdding(false); } }} className="mt-4 w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-cash">Agregar</button>
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
  const [giveBase, setGiveBase] = useState(false);
  const [regDel, setRegDel] = useState(false);
  const [paid, setPaid] = useState(false);

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

  const totalDeliveries = s.deliveriesCashConfirmed + s.deliveriesCashPending + s.deliveriesBankConfirmed + s.deliveriesBankPending;
  const progress = s.totalOwed > 0 ? Math.min(100, Math.round((s.totalReturned / s.totalOwed) * 100)) : 0;
  const hasBase = s.baseGiven > 0;

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
        <Stat label="Domicilios" value={totalDeliveries} />
        <Stat label="Total" value={s.totalOwed} accent />
      </div>

      {s.totalOwed > 0 && (
        <div className="mt-3">
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1 text-right tnum">Devuelto: {formatCOP(s.totalReturned)} / {formatCOP(s.totalOwed)}</div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!hasBase && (
          <button onClick={() => setGiveBase(true)} className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl shadow-cash text-sm">
            <Banknote className="h-4 w-4" /> Dar base hoy
          </button>
        )}
        {hasBase && totalDeliveries === 0 && (
          <>
            <button onClick={() => setRegDel(true)} className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-accent-foreground font-bold py-2.5 rounded-xl shadow-bank text-sm">
              <Package className="h-4 w-4" /> Registrar domicilios
            </button>
            <div className="text-xs text-muted-foreground self-center px-2">Base: {formatCOP(s.baseGiven)}</div>
          </>
        )}
        {hasBase && totalDeliveries > 0 && s.status !== "ok" && (
          <>
            <button onClick={() => setPaid(true)} className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl shadow-cash text-sm">
              <CheckCircle2 className="h-4 w-4" /> Ya me pagó
            </button>
            <button onClick={() => setRegDel(true)} className="flex items-center justify-center gap-1 bg-secondary px-3 py-2.5 rounded-xl text-sm font-medium">
              <Package className="h-4 w-4" /> Más
            </button>
          </>
        )}
        {s.status === "ok" && (
          <>
            <button className="flex-1 flex items-center justify-center gap-1.5 bg-secondary text-foreground font-bold py-2.5 rounded-xl text-sm">
              <Eye className="h-4 w-4" /> Ver resumen
            </button>
            <button onClick={() => setRegDel(true)} className="flex items-center justify-center gap-1 bg-secondary px-3 py-2.5 rounded-xl text-sm font-medium">
              <Package className="h-4 w-4" /> Más
            </button>
          </>
        )}
        {hasBase && (
          <button title="Editar base" className="px-3 py-2.5 rounded-xl bg-secondary text-sm">
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      <GiveBaseWizard open={giveBase} onOpenChange={setGiveBase} date={date} presetWorkerId={worker.id} />
      <RegisterDeliveriesWizard open={regDel} onOpenChange={setRegDel} date={date} workerId={worker.id} />
      <CourierPaidWizard open={paid} onOpenChange={setPaid} date={date} workerId={worker.id} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="glass rounded-xl py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`tnum text-sm font-bold ${accent ? "text-cash" : ""}`}>{formatCOP(value)}</div>
    </div>
  );
}
