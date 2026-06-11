"use client";
import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";

export interface EditableField {
  field: string;          // nombre técnico del campo (ej: "deliveryValue")
  label: string;          // etiqueta legible (ej: "Valor del domicilio")
  currentValue: string;   // valor actual como texto
  type?: "money" | "text" | "number";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: string;     // "ShipdayOrder" | "Movement" | etc.
  entityId: string;
  entityLabel: string;    // "Pedido #30 — $90.000"
  fields: EditableField[];
  onDone?: () => void;
}

function formatMoney(v: string) {
  const n = parseInt(v.replace(/\D/g, "") || "0");
  return "$" + n.toLocaleString("es-CO");
}

export function EditRequestWizard({ open, onOpenChange, entityType, entityId, entityLabel, fields, onDone }: Props) {
  const [step, setStep] = useState(1);
  // valores nuevos por campo (vacío = sin cambio)
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep(1); setNewValues({}); setReason("");
  }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  function setVal(field: string, value: string, type?: string) {
    const clean = type === "money" || type === "number" ? value.replace(/\D/g, "") : value;
    setNewValues(prev => ({ ...prev, [field]: clean }));
  }

  // Solo los campos que efectivamente cambiaron
  const changedFields = fields.filter(f => {
    const nv = newValues[f.field];
    return nv !== undefined && nv !== "" && nv !== f.currentValue;
  });

  async function submit() {
    if (changedFields.length === 0) { toast.error("No has cambiado ningún valor"); return; }
    if (!reason.trim()) { toast.error("Indica el motivo del cambio"); return; }
    setSaving(true);
    try {
      const changes: Record<string, api.EditRequestChange> = {};
      for (const f of changedFields) {
        changes[f.field] = { old: f.currentValue, new: newValues[f.field] };
      }
      await api.createEditRequest({ entityType, entityId, entityLabel, changes, reason });
      toast.success("✅ Solicitud enviada al administrador para aprobación");
      onDone?.();
      close();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      open={open}
      onOpenChange={v => { if (!v) close(); }}
      step={step}
      total={3}
      title={
        step === 1 ? "¿Qué valor quieres cambiar?" :
        step === 2 ? "¿Por qué se requiere el cambio?" :
        "Confirmar solicitud"
      }
      subtitle={entityLabel}
      onBack={step > 1 ? () => setStep(s => s - 1) : undefined}
    >
      {/* Paso 1 — editar campos */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="glass rounded-2xl px-4 py-3 text-xs text-muted-foreground">
            🔒 No puedes editar directamente. Llena solo los campos que deseas cambiar; el resto se deja igual. La solicitud irá al administrador.
          </div>
          {fields.map(f => {
            const nv = newValues[f.field] ?? "";
            const changed = nv !== "" && nv !== f.currentValue;
            return (
              <div key={f.field} className="space-y-1.5">
                <label className="text-sm font-medium">{f.label}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Valor actual</div>
                    <div className="glass rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground">
                      {f.type === "money" ? formatMoney(f.currentValue) : f.currentValue || "—"}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-lg pt-5">→</div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Nuevo valor</div>
                    <input
                      value={f.type === "money" && nv ? formatMoney(nv).replace("$", "") : nv}
                      onChange={e => setVal(f.field, e.target.value, f.type)}
                      placeholder="Sin cambio"
                      inputMode={f.type === "money" || f.type === "number" ? "numeric" : "text"}
                      className={`w-full rounded-xl px-3 py-2 text-sm font-bold outline-none border-2 transition ${
                        changed ? "border-primary bg-primary/5" : "border-border bg-secondary/40"
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <button
            disabled={changedFields.length === 0}
            onClick={() => setStep(2)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            {changedFields.length === 0 ? "Cambia al menos un valor" : `Siguiente → (${changedFields.length} cambio${changedFields.length > 1 ? "s" : ""})`}
          </button>
        </div>
      )}

      {/* Paso 2 — motivo */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Explica por qué se necesita este cambio. El administrador verá este motivo.</p>
          <textarea
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: Se requiere cambio por equivocación de precios. Se digitó $90.000 pero el domicilio real fue $9.000."
            rows={4}
            className="w-full glass-strong rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <button
            disabled={!reason.trim()}
            onClick={() => setStep(3)}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40"
          >
            Ver resumen →
          </button>
        </div>
      )}

      {/* Paso 3 — confirmar */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cambios solicitados</div>
            {changedFields.map(f => (
              <div key={f.field} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="flex items-center gap-2">
                  <span className="line-through text-red-400">
                    {f.type === "money" ? formatMoney(f.currentValue) : f.currentValue}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-bold text-green-600">
                    {f.type === "money" ? formatMoney(newValues[f.field]) : newValues[f.field]}
                  </span>
                </span>
              </div>
            ))}
            <hr className="border-border" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Motivo</div>
              <p className="text-sm">{reason}</p>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 border border-blue-500/30 bg-blue-500/5 text-sm text-blue-700 dark:text-blue-300">
            📨 Se enviará al administrador. Si la aprueba, el cambio se aplicará automáticamente.
          </div>

          <button
            disabled={saving}
            onClick={submit}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-50"
          >
            {saving ? "Enviando…" : "Enviar solicitud al administrador"}
          </button>
        </div>
      )}
    </WizardShell>
  );
}
