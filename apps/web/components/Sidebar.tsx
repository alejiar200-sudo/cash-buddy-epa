"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, Truck, Package, Banknote, ArrowRightLeft, BarChart3, AlertTriangle, LayoutDashboard, LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/shipday", icon: LayoutDashboard, label: "Dashboard Shipday" },
  { to: "/sucursales", icon: Building2, label: "Sucursales" },
  { to: "/shipday/domiciliarios", icon: Truck, label: "Domiciliarios" },
  { to: "/shipday/pedidos", icon: Package, label: "Pedidos" },
  { to: "/shipday/bases", icon: Banknote, label: "Bases" },
  { to: "/shipday/conversiones", icon: ArrowRightLeft, label: "Conversiones" },
  { to: "/shipday/deudas", icon: AlertTriangle, label: "Dashboard Deudas" },
  { to: "/shipday/reportes", icon: BarChart3, label: "Reportes / Cierres" },
];

export function Sidebar() {
  const path = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-background font-black text-xl">
            E
          </div>
          <div>
            <div className="font-bold text-lg leading-none">Cash Buddy</div>
            <div className="text-xs text-muted-foreground mt-1">Shipday Admin</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = path === item.to || (item.to !== "/shipday" && path.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              href={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-cash"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
              <span className="text-sm font-medium">{item.label}</span>
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
        <div className="px-3 pt-3 text-xs text-muted-foreground opacity-70">Cash Buddy · Shipday</div>
      </div>
    </aside>
  );
}
