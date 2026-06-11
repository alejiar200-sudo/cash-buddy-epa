"use client";
import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { MoneyInput } from "../MoneyInput";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { DriverStatement } from "@/lib/sd-api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
  driverName: string;
  statement?: DriverStatement;
  onDone?: () => void;
}

function formatCOP(n: number) { return "$" + n.toLocaleString("es-CO"); }

export function DriverPaymentWizard({ open, onOpenChange, driverId, driverName, statement, onDone }: Props) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(0);
  const [medium, setMedium] = useState<"cash" | "bank" | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingDebt = statement?.pendingDebt ?? 0;
  const basePending = statement
    ? statement.totalBasesGiven - statement.totalBasesPaid
    : 0;

  function reset() {
    setStep(1); setAmount(0); setMedium(null); setNotes("");
  }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit(m: "cash" | "bank") {
    if (amount <= 0) return;
    setSaving(true);
    try {
      await api.registerPayment(driverId, amount, m, notes || undefined);
      toast.success(`✅ Pago de ${formatCOP(amount)} registrado para ${driverName}`);
      onDone?.();
      close();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  const titles = [
    `¿Cuánto le vas a pagar a ${driverName}?`,
    "¿Cómo se entrega el pago?",
    "Confirmar pago",
  ];

  return (
    <WizardShell
      open={open}
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={3}
      title={titles[step - 1]}
      subtitle={pendingDebt > 0 ? `Deuda pendiente: ${formatCOP(pendingDebt)}` : "Sin deuda pendiente"}
      onBack={step > 1 ? () => setStep(s => s - 1) : undefined}
    >
      {/* Paso 1 — Monto */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Resumen de deuda */}
          {statement && (
            <div className="glass rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deuda total</span>
                <span className={`font-bold tnum ${pendingDebt > 0 ? "text-red-500" : "text-green-600"}`}>
                  {pendingDebt > 0 ? formatCOP(pendingDebt) : "Al día ✓"}
                </span>
              </div>
              {basePending > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bases pendientes (se descuenta primero)</span>
                  <span className="font-bold tnum text-amber-500">{formatCOP(basePending)}</span>
                </div>
              )}
              {pendingDebt > 0 && (
                <button
                  onClick={() => setAmount(pendingDebt)}
                  className="w-full text-xs py-2 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary/20 transition mt-1"
                >
                  Pagar deuda completa ({formatCOP(pendingDebt)})
                </button>
              )}
            </div>
          )}

          <MoneyInput value={amount} onChange={setAmount} autoFocus />

          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observaciones (opcional)"
            className="w-full glass rounded-2xl px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />

          <button
            disabled={amount <= 0}
            onClick={() => setStep(2)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Paso 2 — Medio de pago */}
      {step === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setMedium("cash"); setStep(3); }}
            className={`p-6 rounded-2xl border-2 text-center transition ${medium === "cash" ? "border-primary bg-primary/10" : "border-border bg-secondary/60"} hover:border-primary`}
          >
            <div className="text-4xl">💵</div>
            <div className="font-bold mt-2">Efectivo</div>
            <div className="text-xs text-muted-foreground mt-1">Pago en mano</div>
          </button>
          <button
            onClick={() => { setMedium("bank"); setStep(3); }}
            className={`p-6 rounded-2xl border-2 text-center transition ${medium === "bank" ? "border-blue-500 bg-blue-500/10" : "border-border bg-secondary/60"} hover:border-blue-400`}
          >
            <div className="text-4xl">🏦</div>
            <div className="font-bold mt-2 text-blue-600 dark:text-blue-400">Banco</div>
            <div className="text-xs text-muted-foreground mt-1">Transferencia</div>
          </button>
        </div>
      )}

      {/* Paso 3 — Confirmar */}
      {step === 3 && medium && (
        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <Row label="Domiciliario" value={driverName} />
            <Row label="Medio" value={medium === "cash" ? "💵 Efectivo" : "🏦 Banco"} />
            {notes && <Row label="Notas" value={notes} />}
            <hr className="border-border" />
            <Row label="Monto a pagar" value={formatCOP(amount)} highlight positive />
            {statement && pendingDebt > 0 && (
              <>
                {basePending > 0 && amount >= basePending && (
                  <div className="text-xs text-amber-600 bg-amber-500/10 rounded-xl px-3 py-2">
                    ⚡ Se abonará {formatCOP(Math.min(amount, basePending))} a bases pendientes primero
                  </div>
                )}
                <Row
                  label="Deuda restante"
                  value={formatCOP(Math.max(0, pendingDebt - amount))}
                  warn={pendingDebt - amount > 0}
                />
              </>
            )}
          </div>

          <button
            disabled={saving}
            onClick={() => submit(medium)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-50"
          >
            {saving ? "Registrando…" : `Confirmar pago de ${formatCOP(amount)}`}
          </button>
        </div>
      )}
    </WizardShell>
  );
}

function Row({ label, value, highlight, positive, warn }: { label: string; value: string; highlight?: boolean; positive?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${highlight ? (positive ? "text-green-600" : "text-red-500") : warn ? "text-amber-600" : ""}`}>
        {value}
      </span>
    </div>
  );
}
