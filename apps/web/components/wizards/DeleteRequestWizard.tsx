"use client";
import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import * as api from "@/lib/sd-api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: string;
  entityId: string;
  entityLabel: string;
  onDone?: () => void;
}

export function DeleteRequestWizard({ open, onOpenChange, entityType, entityId, entityLabel, onDone }: Props) {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() { setStep(1); setReason(""); }
  function close() { onOpenChange(false); setTimeout(reset, 250); }

  async function submit() {
    if (!reason.trim()) { toast.error("Indica el motivo de la eliminación"); return; }
    setSaving(true);
    try {
      await api.createEditRequest({
        entityType, entityId, entityLabel,
        changes: {},
        reason,
        requestType: "delete",
      });
      toast.success("🗑️ Solicitud de eliminación enviada al administrador");
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
      onOpenChange={(v) => { if (!v) close(); }}
      step={step}
      total={2}
      title={step === 1 ? "¿Por qué eliminar este movimiento?" : "Confirmar solicitud de eliminación"}
      subtitle={entityLabel}
      onBack={step > 1 ? () => setStep(1) : undefined}
    >
      {step === 1 && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4 border border-red-500/30 bg-red-500/5 flex gap-3">
            <Trash2 className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-red-600 dark:text-red-400">Solicitud de eliminación</p>
              <p className="text-muted-foreground mt-0.5">
                No puedes eliminar directamente. El administrador revisará y, si aprueba, el movimiento se eliminará automáticamente revirtiendo sus efectos.
              </p>
            </div>
          </div>
          <textarea
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: Este movimiento no existe / fue registrado por error / está duplicado."
            rows={4}
            className="w-full glass-strong rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
          />
          <button
            disabled={!reason.trim()}
            onClick={() => setStep(2)}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40 hover:bg-red-700 transition"
          >
            Siguiente →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-bold">Se solicitará eliminar:</span>
            </div>
            <p className="text-sm font-medium">{entityLabel}</p>
            <hr className="border-border" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Motivo</div>
              <p className="text-sm">{reason}</p>
            </div>
          </div>
          <div className="glass rounded-2xl p-4 border border-blue-500/30 bg-blue-500/5 text-sm text-blue-700 dark:text-blue-300">
            📨 Llegará al administrador como solicitud de eliminación. Si la aprueba, el movimiento se borra y se ajustan deudas/saldos.
          </div>
          <button
            disabled={saving}
            onClick={submit}
            className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl shadow-cash disabled:opacity-50 hover:bg-red-700 transition"
          >
            {saving ? "Enviando…" : "Enviar solicitud de eliminación"}
          </button>
        </div>
      )}
    </WizardShell>
  );
}
