"use client";
import { useState, useEffect } from "react";
import { WizardShell } from "./WizardShell";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";

const BILLS = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const COINS = [1000, 500, 200, 100, 50];

interface DenomLine { value: number; qty: number }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  onDone?: () => void;
}

function formatCOP(n: number) {
  return "$" + n.toLocaleString("es-CO");
}

export function ShiftCloseWizard({ open, onOpenChange, date, onDone }: Props) {
  const [step, setStep] = useState(1);
  const [shift, setShift] = useState<"AM" | "PM" | "close" | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [handedBy, setHandedBy] = useState("");
  const [bills, setBills] = useState<DenomLine[]>(BILLS.map(v => ({ value: v, qty: 0 })));
  const [coins, setCoins] = useState<DenomLine[]>(COINS.map(v => ({ value: v, qty: 0 })));
  const [expectedAmount, setExpectedAmount] = useState(0);
  const [autoExpected, setAutoExpected] = useState<{ cash: number; bank: number } | null>(null);
  // Turno de la mañana (para que la TARDE verifique lo que dejó la mañana)
  const [amShift, setAmShift] = useState<api.ShiftClose | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isPM = shift === "PM";
  // Quién cerró la mañana (para asociarlo en la verificación de la tarde)
  const morningPerson = amShift?.receivedBy || amShift?.createdByName || "—";
  // Turnos YA registrados hoy → se bloquean para no repetirlos.
  const [doneShifts, setDoneShifts] = useState<Set<string>>(new Set());

  // Al abrir, cargar qué turnos ya están hechos en la fecha seleccionada.
  useEffect(() => {
    if (!open || !date) return;
    api.getShiftsForDate(date)
      .then(shifts => setDoneShifts(new Set(shifts.map(s => s.shift))))
      .catch(() => setDoneShifts(new Set()));
  }, [open, date]);

  // Al seleccionar turno:
  //  - MAÑANA: el sistema calcula el efectivo esperado (movimientos del día).
  //  - TARDE: es una VERIFICACIÓN de lo que dejó la mañana → el esperado es lo que
  //    contó la persona de la mañana; la tarde solo confirma que esté completo.
  useEffect(() => {
    if (!shift || !date) return;
    setAmShift(null);
    api.getShiftsForDate(date).then(shifts => {
      const am = shifts.find(s => s.shift === "AM") ?? null;
      if (shift === "PM") {
        setAmShift(am);
        if (am) {
          setExpectedAmount(am.totalCounted);          // verificar lo que dejó la mañana
          setHandedBy(am.receivedBy || am.createdByName || ""); // la mañana entrega
        }
      }
    }).catch(() => {});

    // El efectivo/banco esperado del sistema (para mostrar; en la mañana es la base de comparación)
    api.getExpectedForDate(date)
      .then(r => {
        setAutoExpected({ cash: r.expectedCash, bank: r.expectedBank });
        if (shift === "AM" || shift === "close") setExpectedAmount(r.expectedCash);
      })
      .catch(() => {});
  }, [shift, date]);

  const totalBills = bills.reduce((s, b) => s + b.value * b.qty, 0);
  const totalCoins = coins.reduce((s, c) => s + c.value * c.qty, 0);
  const totalCounted = totalBills + totalCoins;
  const difference = totalCounted - expectedAmount;

  function updateBill(value: number, qty: number) {
    setBills(prev => prev.map(b => b.value === value ? { ...b, qty: Math.max(0, qty) } : b));
  }
  function updateCoin(value: number, qty: number) {
    setCoins(prev => prev.map(c => c.value === value ? { ...c, qty: Math.max(0, qty) } : c));
  }

  function reset() {
    setStep(1); setShift(null); setReceivedBy(""); setHandedBy("");
    setBills(BILLS.map(v => ({ value: v, qty: 0 })));
    setCoins(COINS.map(v => ({ value: v, qty: 0 })));
    setExpectedAmount(0); setAutoExpected(null); setAmShift(null); setNotes("");
  }

  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit() {
    if (!shift) return;
    setSaving(true);
    try {
      await api.registerShift({
        date,
        shift,
        receivedBy: receivedBy || undefined,
        handedBy: handedBy || undefined,
        denominations: { bills: bills.filter(b => b.qty > 0), coins: coins.filter(c => c.qty > 0) },
        expectedAmount,
        notes: notes || undefined,
      });
      const label = shift === "AM" ? "Recibo AM" : shift === "PM" ? "Recibo PM" : "Cierre final";
      if (isPM) {
        if (difference !== 0) {
          toast.warning(`⚠️ La caja NO está completa: faltante/sobrante de ${formatCOP(Math.abs(difference))}. Hay que rectificar caja.`);
        } else {
          toast.success(`✅ Verificado: ${morningPerson} dejó la caja completa. Recibo PM cerrado.`);
        }
      } else if (difference !== 0) {
        toast.warning(`⚠️ ${label} registrado con descuadre de ${formatCOP(Math.abs(difference))}`);
      } else {
        toast.success(`✅ ${label} registrado — cuadre perfecto`);
      }
      onDone?.();
      close();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  const shiftLabel = shift === "AM" ? "Recibo AM" : shift === "PM" ? "Recibo PM" : shift === "close" ? "Cierre final" : "";

  const titles = [
    "¿Qué turno vas a registrar?",
    isPM ? "¿Quién recibe (tarde)?" : "¿Quién entrega y quién recibe?",
    "Conteo de billetes",
    "Conteo de monedas",
    isPM ? "Verificación de la mañana" : "Monto esperado en caja",
    "Resumen del turno",
  ];

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={6}
      title={titles[step - 1]}
      subtitle={step >= 3 && shift ? `${shiftLabel} — ${date}` : undefined}
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
    >
      {step === 1 && (
        <div className="space-y-3">
          {([
            ["AM", "☀️", "Recibo AM", "La persona de la mañana cierra y deja la caja"],
            ["PM", "🌙", "Recibo PM", "La tarde verifica lo que dejó la mañana"],
            ["close", "🔒", "Cierre final", "Cierre del día contra lo que dice el sistema"],
          ] as const).map(([s, icon, title, desc]) => {
            const done = doneShifts.has(s);
            return (
            <button
              key={s}
              disabled={done}
              onClick={() => { if (!done) { setShift(s); setStep(2); } }}
              className={`w-full p-4 rounded-2xl border-2 transition flex items-center gap-4 ${done ? "border-green-500/30 bg-green-500/5 cursor-not-allowed opacity-70" : "border-border glass hover:border-primary"}`}
            >
              <span className="text-3xl">{done ? "✅" : icon}</span>
              <div className="text-left flex-1">
                <div className="font-bold">{title}</div>
                <div className="text-xs text-muted-foreground">{done ? "Ya registrado hoy — no se puede repetir" : desc}</div>
              </div>
            </button>
            );
          })}
          {doneShifts.size >= 3 && (
            <p className="text-center text-sm text-green-600 font-medium pt-2">✅ Todos los turnos del día ya están registrados.</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {isPM && (
            <div className="glass rounded-2xl px-4 py-3 text-sm border border-primary/20">
              {amShift ? (
                <>
                  🌅 La mañana la cerró <strong>{morningPerson}</strong> y dejó <strong>{formatCOP(amShift.totalCounted)}</strong> en caja.
                  <div className="text-xs text-muted-foreground mt-1">Ahora vas a verificar que esté completo.</div>
                </>
              ) : (
                <span className="text-amber-600">⚠️ Aún no hay cierre de la mañana para este día. Regístralo primero.</span>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{isPM ? "Persona que recibe (turno tarde)" : "Persona que recibe el turno"}</label>
            <input
              autoFocus
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Nombre de quien recibe"
              className="w-full glass-strong rounded-2xl px-5 py-3 text-base outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{isPM ? "Entregó (mañana)" : "Persona que entrega el turno"}</label>
            <input
              value={handedBy}
              onChange={(e) => setHandedBy(e.target.value)}
              placeholder={isPM ? "Quien cerró la mañana" : "Nombre de quien entrega (opcional)"}
              className="w-full glass-strong rounded-2xl px-5 py-3 text-base outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            disabled={!receivedBy.trim() || (isPM && !amShift)}
            onClick={() => setStep(3)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-2">
            {BILLS.map(v => (
              <div key={v} className="flex items-center justify-between gap-3">
                <span className="font-medium w-28">{formatCOP(v)}</span>
                <div className="flex items-center gap-2 flex-1">
                  <button onClick={() => updateBill(v, (bills.find(b => b.value === v)?.qty ?? 0) - 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">−</button>
                  <input
                    type="number"
                    min={0}
                    value={bills.find(b => b.value === v)?.qty ?? 0}
                    onChange={(e) => updateBill(v, parseInt(e.target.value) || 0)}
                    className="flex-1 text-center bg-secondary rounded-lg py-1 font-bold outline-none"
                  />
                  <button onClick={() => updateBill(v, (bills.find(b => b.value === v)?.qty ?? 0) + 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">+</button>
                </div>
                <span className="text-sm text-muted-foreground w-24 text-right tnum">{formatCOP((bills.find(b => b.value === v)?.qty ?? 0) * v)}</span>
              </div>
            ))}
          </div>
          <div className="glass-strong rounded-2xl p-3 flex justify-between items-center">
            <span className="font-medium">Total billetes</span>
            <span className="font-black text-lg tnum text-primary">{formatCOP(totalBills)}</span>
          </div>
          <button onClick={() => setStep(4)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">
            Siguiente → Monedas
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="space-y-2">
            {COINS.map(v => (
              <div key={v} className="flex items-center justify-between gap-3">
                <span className="font-medium w-28">{formatCOP(v)}</span>
                <div className="flex items-center gap-2 flex-1">
                  <button onClick={() => updateCoin(v, (coins.find(c => c.value === v)?.qty ?? 0) - 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">−</button>
                  <input
                    type="number"
                    min={0}
                    value={coins.find(c => c.value === v)?.qty ?? 0}
                    onChange={(e) => updateCoin(v, parseInt(e.target.value) || 0)}
                    className="flex-1 text-center bg-secondary rounded-lg py-1 font-bold outline-none"
                  />
                  <button onClick={() => updateCoin(v, (coins.find(c => c.value === v)?.qty ?? 0) + 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">+</button>
                </div>
                <span className="text-sm text-muted-foreground w-24 text-right tnum">{formatCOP((coins.find(c => c.value === v)?.qty ?? 0) * v)}</span>
              </div>
            ))}
          </div>
          <div className="glass-strong rounded-2xl p-3 flex justify-between items-center">
            <span className="font-medium">Total monedas</span>
            <span className="font-black text-lg tnum text-primary">{formatCOP(totalCoins)}</span>
          </div>
          <button onClick={() => setStep(5)} className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash">
            {isPM ? "Siguiente → Verificación" : "Siguiente → Monto esperado"}
          </button>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          {isPM ? (
            /* TARDE = verificación de lo que dejó la mañana */
            <>
              <div className="glass-strong rounded-2xl p-4 space-y-2 border border-primary/20">
                <div className="text-xs font-bold uppercase tracking-wider text-primary">Verificación de la mañana</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cerró la mañana</span>
                  <span className="font-bold">{morningPerson}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Dejó en caja</span>
                  <span className="font-bold tnum">{formatCOP(expectedAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tú contaste</span>
                  <span className="font-bold tnum">{formatCOP(totalCounted)}</span>
                </div>
              </div>
              <div className={`rounded-2xl p-4 text-center font-bold ${difference === 0 ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                {difference === 0
                  ? `✅ Caja completa — ${morningPerson} dejó todo bien`
                  : `⚠️ Hay que RECTIFICAR CAJA: ${difference > 0 ? "sobran" : "faltan"} ${formatCOP(Math.abs(difference))}`}
              </div>
            </>
          ) : (
            /* MAÑANA = efectivo/banco esperado calculado por el sistema (no editable) */
            <>
              <p className="text-sm text-muted-foreground">
                Estos valores los calcula el sistema y <strong>no se pueden modificar</strong>. Solo verifica contra lo que contaste.
              </p>
              {autoExpected ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-strong rounded-2xl p-5 text-center border border-primary/20">
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">💵 Efectivo esperado <span title="Calculado por el sistema, no editable">🔒</span></div>
                    <div className="text-2xl font-black tnum text-primary mt-1">{formatCOP(autoExpected.cash)}</div>
                  </div>
                  <div className="glass-strong rounded-2xl p-5 text-center border border-border">
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">🏦 Banco esperado <span title="Calculado por el sistema, no editable">🔒</span></div>
                    <div className="text-2xl font-black tnum mt-1">{formatCOP(autoExpected.bank)}</div>
                  </div>
                </div>
              ) : (
                <div className="glass rounded-2xl p-4 text-center text-sm text-muted-foreground">Calculando valores esperados del sistema…</div>
              )}
              <div className="glass rounded-xl px-4 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
                <span>🔒</span>
                <span>El efectivo y el banco esperado se obtienen automáticamente de los movimientos del sistema. Ningún trabajador puede cambiarlos.</span>
              </div>
            </>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Observaciones (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Novedades del turno…"
              rows={2}
              className="w-full glass rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <button
            onClick={() => setStep(6)}
            disabled={!isPM && !autoExpected}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            {(isPM || autoExpected) ? "Ver resumen →" : "Cargando valor del sistema…"}
          </button>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <SummaryRow label="Turno" value={shiftLabel} />
            <SummaryRow label={isPM ? "Recibe (tarde)" : "Recibe"} value={receivedBy} />
            {handedBy && <SummaryRow label={isPM ? "Entregó (mañana)" : "Entrega"} value={handedBy} />}
            <hr className="border-border" />
            <SummaryRow label="Total billetes" value={formatCOP(totalBills)} />
            <SummaryRow label="Total monedas" value={formatCOP(totalCoins)} />
            <SummaryRow label="Total contado" value={formatCOP(totalCounted)} highlight />
            <SummaryRow label={isPM ? "Dejó la mañana" : "Monto esperado"} value={formatCOP(expectedAmount)} />
            <div className={`flex items-center justify-between text-sm font-bold p-3 rounded-xl ${difference === 0 ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              <span>{isPM ? "Verificación" : "Diferencia"}</span>
              <span className="text-lg tnum">
                {difference === 0
                  ? (isPM ? "✅ Caja completa" : "✅ Cuadre perfecto")
                  : (isPM ? `⚠️ Rectificar: ${difference > 0 ? "+" : ""}${formatCOP(difference)}` : `${difference > 0 ? "+" : ""}${formatCOP(difference)}`)}
              </span>
            </div>
            {notes && <SummaryRow label="Notas" value={notes} />}
          </div>
          <button
            disabled={saving}
            onClick={submit}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Confirmar cierre de turno"}
          </button>
        </div>
      )}
    </WizardShell>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${highlight ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
