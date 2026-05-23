import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { formatCOP } from "@/lib/format";
import { Plus, Bike, Building2 } from "lucide-react";

export const Route = createFileRoute("/trabajadores")({ component: WorkersPage });

function WorkersPage() {
  const { state, addWorker, updateWorker } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"domiciliario" | "administrativo">("domiciliario");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">👥 Trabajadores</h1>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl shadow-cash">
          <Plus className="h-4 w-4" /> Agregar trabajador
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {state.workers.map(w => {
          // Aggregate all time
          let domiCount = 0, payrollTotal = 0, receivedTotal = 0;
          for (const d of Object.keys(state.days)) {
            for (const m of state.days[d].movements) {
              if (m.workerId !== w.id) continue;
              if (m.category === 1 || m.category === 2) { domiCount++; receivedTotal += m.amount; }
              if (m.category === 15 || m.category === 18) payrollTotal += m.amount;
            }
          }
          return (
            <div key={w.id} className={`glass-strong rounded-3xl p-5 ${!w.active ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <Avatar worker={w} size={44} />
                <div className="flex-1">
                  <div className="font-bold">{w.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {w.role === "domiciliario" ? <Bike className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                    {w.role}
                  </div>
                </div>
                <button onClick={() => updateWorker(w.id, { active: !w.active })} className={`text-xs px-2.5 py-1 rounded-full font-bold ${w.active ? "bg-cash-soft text-cash" : "bg-secondary text-muted-foreground"}`}>
                  {w.active ? "Activo" : "Inactivo"}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Mini label="Domicilios" value={domiCount.toString()} />
                <Mini label="Total recibido" value={formatCOP(receivedTotal)} />
                <Mini label="Nómina" value={formatCOP(payrollTotal)} />
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="glass-strong rounded-3xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Nuevo trabajador</h3>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-full glass rounded-xl px-4 py-3 outline-none mb-3" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRole("domiciliario")} className={`p-3 rounded-xl border-2 ${role === "domiciliario" ? "border-primary bg-cash-soft" : "border-border glass"}`}>🛵 Domiciliario</button>
              <button onClick={() => setRole("administrativo")} className={`p-3 rounded-xl border-2 ${role === "administrativo" ? "border-accent bg-bank-soft" : "border-border glass"}`}>🏢 Administrativo</button>
            </div>
            <button onClick={() => { if (name.trim()) { addWorker({ name: name.trim(), role, active: true }); setName(""); setAdding(false); } }} className="mt-4 w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-cash">Agregar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tnum">{value}</div>
    </div>
  );
}
