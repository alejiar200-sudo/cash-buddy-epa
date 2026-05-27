"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Bike, ListChecks, Lock, Calendar, Briefcase, Users, Settings as Cog, LogOut,
} from "lucide-react";
import { useStore, courierStatusForDay } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/", icon: Home, label: "Dashboard" },
  { to: "/domiciliarios", icon: Bike, label: "Domiciliarios", badge: "couriers" as const },
  { to: "/movimientos", icon: ListChecks, label: "Movimientos del día" },
  { to: "/arqueos", icon: Lock, label: "Arqueos" },
  { to: "/historial", icon: Calendar, label: "Historial" },
  { to: "/nomina", icon: Briefcase, label: "Nómina" },
  { to: "/trabajadores", icon: Users, label: "Trabajadores" },
  { to: "/configuracion", icon: Cog, label: "Configuración" },
];

export function Sidebar() {
  const path = usePathname();
  const { state, getDay } = useStore();
  const { date } = useDay();
  const { logout } = useAuth();
  const day = getDay(date);

  const pendingCount = state.workers
    .filter((w) => w.active && w.role === "domiciliario")
    .map((w) => courierStatusForDay(day, w.id))
    .filter((s) => s.status === "debt" || s.status === "partial").length;

  return (
    <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-background font-black text-xl">
            E
          </div>
          <div>
            <div className="font-bold text-lg leading-none">{state.settings.companyName}</div>
            <div className="text-xs text-muted-foreground mt-1">Caja diaria</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => {
          const active = path === item.to;
          const Icon = item.icon;
          const showBadge = item.badge === "couriers" && pendingCount > 0;
          return (
            <Link
              key={item.to}
              href={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition group ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-cash"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              {showBadge && (
                <span className="bg-danger text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full animate-pulse-warn">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition"
        >
          <LogOut className="h-5 w-5" />
          <span className="flex-1 text-sm font-medium text-left">Cerrar sesión</span>
        </button>
        <div className="px-3 pt-3 text-xs text-muted-foreground opacity-70">v1.0 · Hecho para Epa</div>
      </div>
    </aside>
  );
}
