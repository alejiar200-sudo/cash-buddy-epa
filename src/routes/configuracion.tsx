import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { MoneyInput } from "@/components/MoneyInput";
import { formatCOP } from "@/lib/format";
import { Trash2, AlertTriangle, Percent } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/configuracion")({ component: SettingsPage });

function SettingsPage() {
  const { state, setState, resetAll } = useStore();
  const [name, setName] = useState(state.settings.companyName);
  const [cash, setCash] = useState(state.settings.initialCash);
  const [bank, setBank] = useState(state.settings.initialBank);
  const [pct, setPct] = useState(state.settings.commissionPercent ?? 0);
  const [confirm, setConfirm] = useState(0);

  function save() {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, companyName: name, initialCash: cash, initialBank: bank, commissionPercent: pct },
    }));
    toast.success("✅ Configuración guardada");
  }

  const example = Math.round(10000 * (pct / 100));

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold">⚙️ Configuración</h1>

      <div className="glass-strong rounded-3xl p-6 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Nombre de la empresa</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full glass rounded-xl px-4 py-3 outline-none text-lg font-bold" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Saldo inicial efectivo</div>
          <MoneyInput value={cash} onChange={setCash} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Saldo inicial banco</div>
          <MoneyInput value={bank} onChange={setBank} />
        </div>
        <button onClick={save} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-cash">Guardar cambios</button>
      </div>

      <div className="glass-strong rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-lg">💰 Comisión a domiciliarios</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Este es el porcentaje del valor de cada domicilio que la empresa le paga al domiciliario como su parte.
          Se suma automáticamente a la nómina pendiente de cada trabajador.
        </p>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Porcentaje por domicilio (%)</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="flex-1 glass rounded-xl px-4 py-3 outline-none text-2xl font-black tnum"
            />
            <span className="text-2xl font-black text-muted-foreground">%</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-cash-soft text-cash text-sm">
          💡 Si un domicilio vale <b>$10.000</b>, el domiciliario recibe <b className="tnum">{formatCOP(example)}</b> ({pct}%)
        </div>
        <button onClick={save} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-cash">Guardar porcentaje</button>
      </div>

      <div className="glass-strong rounded-3xl p-6 border border-danger/30">
        <div className="flex items-center gap-2 text-danger mb-2">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-bold">Zona peligrosa</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Esto borra absolutamente toda la información: trabajadores, días, movimientos, arqueos.</p>
        {confirm === 0 && (
          <button onClick={() => setConfirm(1)} className="flex items-center gap-2 bg-danger-soft text-danger font-bold px-4 py-2.5 rounded-xl">
            <Trash2 className="h-4 w-4" /> Borrar todos los datos
          </button>
        )}
        {confirm === 1 && (
          <button onClick={() => setConfirm(2)} className="bg-danger text-destructive-foreground font-bold px-4 py-2.5 rounded-xl">
            ¿Seguro? Toca otra vez
          </button>
        )}
        {confirm === 2 && (
          <button onClick={() => { resetAll(); toast.success("Todo borrado. Te llevará al asistente."); setConfirm(0); }} className="bg-danger text-destructive-foreground font-bold px-4 py-2.5 rounded-xl animate-pulse-warn">
            💥 SÍ, borrar todo definitivamente
          </button>
        )}
      </div>
    </div>
  );
}

