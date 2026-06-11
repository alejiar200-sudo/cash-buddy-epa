"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Pantalla de Términos y Condiciones. Se muestra en la primera entrada al sistema
 * (cuando settings.termsAcceptedAt es null). Al aceptar, registra la fecha que
 * además inicia la garantía de 2 meses.
 */
export function TermsGate({ onAccepted }: { onAccepted?: () => void }) {
  const { updateSettings } = useStore();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function accept() {
    if (!checked) return;
    setSaving(true);
    try {
      await updateSettings({ termsAcceptedAt: new Date().toISOString() });
      toast.success("✅ Términos aceptados. ¡Bienvenido!");
      onAccepted?.();
    } catch (err) {
      toast.error(String(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-8">
        <div className="flex flex-col items-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-background">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-2xl font-black text-center">Términos y Condiciones de Uso del Sistema</h1>
          <p className="text-sm text-muted-foreground">Por favor lee y acepta antes de continuar</p>
        </div>

        <div className="glass-strong rounded-3xl p-6 space-y-4 max-h-[55vh] overflow-y-auto text-sm leading-relaxed">
          <Term n="Uso Restringido">
            Usted reconoce que el uso del sistema es estrictamente para su operación interna.
            No se le permite modificar, copiar, distribuir ni alterar el sistema, ni su código, de ninguna forma.
          </Term>
          <Term n="Comunicación Obligatoria">
            Cualquier falla, error o necesidad de modificación del sistema debe ser reportada directamente a
            <strong> Alejandro Jiménez Arbeláez</strong>, cédula <strong>1040032918</strong>, teléfono <strong>3234750914</strong>.
            Usted no debe realizar cambios por su cuenta ni delegar dicha responsabilidad.
          </Term>
          <Term n="Propiedad Intelectual">
            Todo el código, diseño y funcionamiento del sistema son propiedad intelectual de Alejandro Jiménez Arbeláez.
            Queda estrictamente prohibido reproducir, modificar o redistribuir cualquier parte del sistema.
          </Term>
          <Term n="Responsabilidad">
            Usted entiende que cualquier modificación no autorizada, uso indebido o distribución del sistema será
            responsabilidad suya. Cualquier incidencia deberá ser resuelta directamente con el desarrollador.
          </Term>
          <Term n="Multa">
            En caso de incumplimiento de estos términos, se aplicará una multa de
            <strong> 12 millones de pesos colombianos</strong>.
          </Term>
          <Term n="Garantía">
            Desde el momento en que usted comienza a usar el sistema, tiene una garantía de <strong>dos meses</strong>.
            En el dashboard se habilitará un apartado con una cuenta regresiva que mostrará el tiempo de garantía.
            Si en el dashboard la garantía ya no aparece, significa que ha vencido. Cualquier reparación,
            modificación o adición de funcionalidad después de ese periodo será cobrada.
          </Term>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Al aceptar, usted declara haber leído, entendido y aceptado estos términos en su primera entrada al sistema.
          </p>
        </div>

        <label className="flex items-start gap-3 mt-4 cursor-pointer px-1">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5 w-5 h-5 rounded" />
          <span className="text-sm font-medium">He leído, entendido y acepto los Términos y Condiciones de Uso del Sistema.</span>
        </label>

        <button
          disabled={!checked || saving}
          onClick={accept}
          className="mt-4 w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-cash disabled:opacity-40 hover:opacity-90 transition"
        >
          {saving ? "Guardando…" : "Aceptar y comenzar a usar el sistema"}
        </button>
        <p className="text-center text-[11px] text-muted-foreground mt-3">Desarrollado por Alejandro Jiménez Arbeláez · ZENBYTE · 3234750914</p>
      </div>
    </div>
  );
}

function Term({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold text-foreground">{n}:</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
