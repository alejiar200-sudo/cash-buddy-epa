"use client";
import { useEffect, useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
  prefill?: { type: "ingreso" | "egreso"; amount: number; description?: string; pairWith?: string };
}

function formatCOP(n: number) { return "$" + n.toLocaleString("es-CO"); }

/**
 * Módulo banco simplificado:
 *  Tipo (Ingreso/Salida) → Medio (Efectivo/Transferencia) → Monto → Domiciliario(opc)+Observación → Confirmar.
 * NO crea movimiento contrario automático. El domiciliario es solo trazabilidad (no afecta deudas/bases).
 */
export function UnifiedBankWizard({ open, onOpenChange, onDone, prefill }: Props) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<"ingreso" | "egreso" | null>(null);
  const [medium, setMedium] = useState<"cash" | "bank" | "mixed" | null>(null);
  const [amount, setAmount] = useState(0);
  const [cashPart, setCashPart] = useState(0);
  const [bankPart, setBankPart] = useState(0);
  const [description, setDescription] = useState("");
  const [driverId, setDriverId] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [drivers, setDrivers] = useState<api.Driver[]>([]);
  const [saving, setSaving] = useState(false);
  const [pairWith, setPairWith] = useState<string | undefined>();

  useEffect(() => {
    if (open && drivers.length === 0) api.getDrivers().then(setDrivers).catch(() => {});
  }, [open]);

  // Si viene pre-cargado (botón "registrar contraparte"), saltar al paso de medio
  useEffect(() => {
    if (open && prefill) {
      setType(prefill.type);
      setAmount(prefill.amount);
      setDescription(prefill.description ?? ""); // ya NO se copia la descripción de la contraparte
      setPairWith(prefill.pairWith);
      setStep(2); // ya tenemos tipo y monto → elegir medio
    }
  }, [open, prefill]);

  function reset() {
    setStep(1); setType(null); setMedium(null); setAmount(0); setCashPart(0); setBankPart(0);
    setDescription(""); setDriverId(""); setDriverSearch(""); setTxDate(new Date().toISOString().slice(0, 10)); setPairWith(undefined);
  }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  const isMixed = medium === "mixed";
  const effectiveAmount = isMixed ? cashPart + bankPart : amount;

  async function submit() {
    if (!type || !medium) return;
    setSaving(true);
    try {
      await api.createBankTransaction({
        type,
        medium: isMixed ? "bank" : medium, // en mixto el backend crea dos registros
        amount: effectiveAmount,
        ...(isMixed ? { cashAmount: cashPart, bankAmount: bankPart } : {}),
        description: description || (type === "ingreso" ? "Ingreso" : "Salida"),
        driverId: driverId || undefined,
        date: new Date(txDate + "T12:00:00").toISOString(),
        ...(pairWith ? { pairWith } : {}),
      });
      const medioLabel = isMixed ? `mixto (${formatCOP(cashPart)} efectivo + ${formatCOP(bankPart)} transferencia)` : (medium === "cash" ? "efectivo" : "transferencia");
      toast.success(`✅ ${type === "ingreso" ? "Ingreso" : "Salida"} ${medioLabel} — ${formatCOP(effectiveAmount)}`);
      onDone?.();
      close();
    } catch (err) { toast.error(String(err)); }
    finally { setSaving(false); }
  }

  const titles = [
    "¿Es ingreso o salida?",
    "¿Por qué medio?",
    "¿Cuánto fue el monto?",
    "Domiciliario y observación",
    "Confirmar movimiento",
  ];

  return (
    <WizardShell
      open={open}
      onOpenChange={v => { if (!v) close(); }}
      step={step}
      total={5}
      title={titles[step - 1]}
      subtitle={step > 1 && type ? `${type === "ingreso" ? "📥 Ingreso" : "📤 Salida"}${medium ? ` · ${medium === "cash" ? "💵 Efectivo" : medium === "mixed" ? "💵+🏦 Mixto" : "🏦 Transferencia"}` : ""}` : undefined}
      onBack={step > 1 ? () => setStep(s => s - 1) : undefined}
    >
      {/* Paso 1 — Tipo */}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setType("ingreso"); setStep(2); }}
            className={`p-6 rounded-2xl border-2 text-center transition ${type === "ingreso" ? "border-green-500 bg-green-500/10" : "border-border bg-secondary/40"} hover:border-green-500`}>
            <div className="text-4xl">📥</div>
            <div className="font-bold mt-2 text-green-600">Ingreso</div>
            <div className="text-xs text-muted-foreground mt-1">Entra dinero a la empresa</div>
          </button>
          <button onClick={() => { setType("egreso"); setStep(2); }}
            className={`p-6 rounded-2xl border-2 text-center transition ${type === "egreso" ? "border-red-500 bg-red-500/10" : "border-border bg-secondary/40"} hover:border-red-500`}>
            <div className="text-4xl">📤</div>
            <div className="font-bold mt-2 text-red-500">Salida</div>
            <div className="text-xs text-muted-foreground mt-1">Sale dinero de la empresa</div>
          </button>
        </div>
      )}

      {/* Paso 2 — Medio */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setMedium("cash"); setStep(3); }}
              className={`p-6 rounded-2xl border-2 text-center transition ${medium === "cash" ? "border-primary bg-primary/10" : "border-border bg-secondary/40"} hover:border-primary`}>
              <div className="text-4xl">💵</div>
              <div className="font-bold mt-2">Efectivo</div>
            </button>
            <button onClick={() => { setMedium("bank"); setStep(3); }}
              className={`p-6 rounded-2xl border-2 text-center transition ${medium === "bank" ? "border-blue-500 bg-blue-500/10" : "border-border bg-secondary/40"} hover:border-blue-400`}>
              <div className="text-4xl">🏦</div>
              <div className="font-bold mt-2 text-blue-600 dark:text-blue-400">Transferencia</div>
            </button>
          </div>
          <button onClick={() => { setMedium("mixed"); setStep(3); }}
            className={`w-full p-5 rounded-2xl border-2 text-center transition ${medium === "mixed" ? "border-amber-500 bg-amber-500/10" : "border-border bg-secondary/40"} hover:border-amber-400`}>
            <div className="text-3xl">💵 + 🏦</div>
            <div className="font-bold mt-1 text-amber-600 dark:text-amber-400">Mixto (parte efectivo + parte transferencia)</div>
            <div className="text-xs text-muted-foreground mt-1">Ej: $40.000 efectivo y $60.000 transferencia</div>
          </button>
        </div>
      )}

      {/* Paso 3 — Monto */}
      {step === 3 && (
        <div className="space-y-4">
          {isMixed ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1">💵 Efectivo</label>
                <MoneyInput value={cashPart} onChange={setCashPart} autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1">🏦 Transferencia</label>
                <MoneyInput value={bankPart} onChange={setBankPart} />
              </div>
              <div className="glass-strong rounded-2xl p-3 flex justify-between items-center">
                <span className="font-medium">Total del movimiento</span>
                <span className="font-black text-lg tnum text-primary">{formatCOP(cashPart + bankPart)}</span>
              </div>
              <button disabled={cashPart <= 0 || bankPart <= 0} onClick={() => setStep(4)}
                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">
                {cashPart <= 0 || bankPart <= 0 ? "Ingresa ambos montos" : "Siguiente →"}
              </button>
            </>
          ) : (
            <>
              <MoneyInput value={amount} onChange={setAmount} autoFocus />
              <button disabled={amount <= 0} onClick={() => setStep(4)}
                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40">
                Siguiente →
              </button>
            </>
          )}
        </div>
      )}

      {/* Paso 4 — Domiciliario(opcional) + Observación + Fecha */}
      {step === 4 && (
        <div className="space-y-3">
          <input autoFocus value={description} onChange={e => setDescription(e.target.value)}
            autoComplete="off" autoCorrect="off" spellCheck={false} name="obs-banco-nofill"
            placeholder="Observación (ej: pago proveedor, le transferí a Norberto…)"
            className="w-full glass-strong rounded-2xl px-5 py-4 text-base outline-none focus:ring-2 focus:ring-primary/40" />
          <div>
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">👤 Domiciliario <span className="opacity-60">(opcional, solo trazabilidad)</span></label>
            <DriverPicker
              drivers={drivers}
              value={driverId}
              onChange={setDriverId}
              search={driverSearch}
              onSearch={setDriverSearch}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Fecha</label>
            <input type="date" value={txDate} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setTxDate(e.target.value)}
              className="w-full mt-1 glass rounded-2xl px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <button onClick={() => setStep(5)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">
            Ver resumen →
          </button>
        </div>
      )}

      {/* Paso 5 — Confirmar */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <Row label="Tipo" value={type === "ingreso" ? "📥 Ingreso" : "📤 Salida"} />
            <Row label="Medio" value={medium === "cash" ? "💵 Efectivo" : medium === "mixed" ? "💵+🏦 Mixto" : "🏦 Transferencia"} />
            {description && <Row label="Observación" value={description} />}
            {driverId && <Row label="Domiciliario" value={drivers.find(d => d.id === driverId)?.name ?? ""} />}
            <Row label="Fecha" value={new Date(txDate + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })} />
            <hr className="border-border" />
            {isMixed && <Row label="💵 Efectivo" value={formatCOP(cashPart)} />}
            {isMixed && <Row label="🏦 Transferencia" value={formatCOP(bankPart)} />}
            <Row label="Monto total" value={formatCOP(effectiveAmount)} highlight positive={type === "ingreso"} />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {medium === "cash" ? "Afecta el saldo en efectivo" : medium === "mixed" ? "Afecta efectivo y banco según el reparto" : "Afecta el saldo en banco"}. No se crea movimiento contrario automático.
          </p>
          <button disabled={saving} onClick={submit}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-50">
            {saving ? "Guardando…" : "Confirmar movimiento"}
          </button>
        </div>
      )}
    </WizardShell>
  );
}

function Row({ label, value, highlight, positive }: { label: string; value: string; highlight?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${highlight ? (positive ? "text-green-600" : "text-red-500") : ""}`}>{value}</span>
    </div>
  );
}

// Color determinista a partir del nombre (para el avatar).
const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-fuchsia-500", "bg-teal-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Selector interactivo de domiciliario: búsqueda + tarjetas con avatar y selección visible.
function DriverPicker({
  drivers, value, onChange, search, onSearch,
}: {
  drivers: api.Driver[];
  value: string;
  onChange: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q ? drivers.filter(d => d.name.toLowerCase().includes(q)) : drivers;
  const selected = drivers.find(d => d.id === value);

  return (
    <div className="mt-1 space-y-2">
      <div className="relative">
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          autoComplete="off" spellCheck={false} name="driver-search-nofill"
          placeholder="Buscar domiciliario…"
          className="w-full glass rounded-2xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 bg-secondary/40"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/10 border border-primary/30 px-3 py-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`w-7 h-7 rounded-full ${avatarColor(selected.name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{initials(selected.name)}</span>
            <span className="text-sm font-semibold truncate">{selected.name}</span>
          </span>
          <button type="button" onClick={() => onChange("")} className="text-xs text-muted-foreground hover:text-red-500 font-bold shrink-0">Quitar ✕</button>
        </div>
      )}

      <div className="max-h-52 overflow-y-auto rounded-2xl border border-border divide-y divide-border/50">
        <button
          type="button"
          onClick={() => onChange("")}
          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-secondary/60 ${!value ? "bg-secondary/40 font-semibold" : ""}`}
        >
          <span className="w-7 h-7 rounded-full bg-secondary text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0">—</span>
          Sin asignar
        </button>
        {filtered.map(d => {
          const active = d.id === value;
          return (
            <button
              type="button"
              key={d.id}
              onClick={() => onChange(d.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-secondary/60 ${active ? "bg-primary/15 font-semibold" : ""}`}
            >
              <span className={`w-7 h-7 rounded-full ${avatarColor(d.name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{initials(d.name)}</span>
              <span className="flex-1 text-left truncate">{d.name}</span>
              {d.pendingDebt > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 font-bold shrink-0 tnum">
                  debe ${d.pendingDebt.toLocaleString("es-CO")}
                </span>
              )}
              {active && <span className="text-primary shrink-0">✓</span>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">Sin resultados para “{search}”</div>
        )}
      </div>
    </div>
  );
}
