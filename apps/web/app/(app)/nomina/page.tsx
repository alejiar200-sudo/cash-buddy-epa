"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NominaRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/trabajadores"); }, []);
  return <div className="flex items-center justify-center h-64 text-muted-foreground">Redirigiendo a Trabajadores…</div>;
}
