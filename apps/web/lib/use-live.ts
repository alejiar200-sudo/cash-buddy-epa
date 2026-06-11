"use client";
import { useEffect, useRef } from "react";

/**
 * Ejecuta `fn` periódicamente para mantener la pantalla actualizada en vivo.
 * Solo refresca cuando la pestaña está visible (ahorra recursos/red).
 * Como varios PCs usan la URL local, esto asegura que los cambios de un equipo
 * se reflejen en todos en pocos segundos.
 */
export function useLive(fn: () => void, ms = 5000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const tick = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") ref.current();
    };
    const id = setInterval(tick, ms);
    // Refrescar también al volver a la pestaña
    const onVis = () => { if (document.visibilityState === "visible") ref.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [ms]);
}
