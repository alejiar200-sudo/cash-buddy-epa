"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle, XCircle, Clock, Building2 } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import type { Branch } from "@/lib/sd-api";
import Link from "next/link";

export default function ShipdayDashboardPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setBranches(await api.getBranches());
    } catch { toast.error("Error al cargar sucursales"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const syncIcon = (s: Branch["syncStatus"]) => ({
    ok: <CheckCircle className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
    never: <Clock className="h-4 w-4 text-muted-foreground" />,
  }[s]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Shipday</h1>
          <p className="text-sm text-muted-foreground">Estado de sucursales conectadas</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border border-border hover:bg-secondary transition">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Cargando...</div>
      ) : branches.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-bold text-lg">Sin sucursales configuradas</p>
          <Link href="/sucursales" className="text-primary font-bold hover:underline text-sm mt-2 block">
            Crear sucursal →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map(b => (
            <div key={b.id} className="glass-strong rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{b.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${b.active ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>
                  {b.active ? "Activa" : "Inactiva"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {syncIcon(b.syncStatus)}
                <span className="text-muted-foreground">
                  {b.syncStatus === "ok" ? "Conectada" : b.syncStatus === "error" ? "Error de conexión" : "Sin sincronizar"}
                </span>
              </div>
              {b.lastSyncAt && (
                <p className="text-xs text-muted-foreground">
                  Última sync: {new Date(b.lastSyncAt).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Link href="/shipday/pedidos" className="flex-1 text-center text-xs py-2 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary/20 transition">
                  Ver pedidos
                </Link>
                <Link href="/shipday/domiciliarios" className="flex-1 text-center text-xs py-2 rounded-xl border border-border hover:bg-secondary transition">
                  Domiciliarios
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
