"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConversionesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/banco"); }, []);
  return <div className="flex items-center justify-center h-64 text-muted-foreground">Redirigiendo a Banco…</div>;
}
