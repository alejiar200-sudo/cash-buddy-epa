import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, dayBalances, courierStatusForDay, CATEGORY_LABEL, type CategoryCode } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { shiftDate } from "@/lib/format";
import { formatCOP } from "@/lib/format";
import { Banknote, Wallet, Coins, Sunrise, ArrowUp, ArrowDown, CheckCircle2, AlertCircle, Clock, CircleDashed } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { state, getDay } = useStore();
  const { date } = useDay();
  const day = getDay(date);
  const balances = dayBalances(day);

  const yesterday = getDay(shiftDate(date, -1));
  const yBalances = dayBalances(yesterday);

  const couriers = state.workers.filter(w => w.active && w.role === "domiciliario");
  const statuses = couriers.map(w => ({ worker: w, ...courierStatusForDay(day, w.id) }));
  const okCount = statuses.filter(s => s.status === "ok").length;
  const totalActive = statuses.filter(s => s.status !== "idle").length;
  const progress = totalActive > 0 ? Math.round((okCount / totalActive) * 100) : 0;

  // Movement category breakdown per medium
  const breakdown = (medium: "cash" | "bank") => {
    const map = new Map<CategoryCode, { ing: number; egr: number }>();
    for (const m of day.movements) {
      if (m.medium !== medium || m.status !== "confirmed") continue;
      const cur = map.get(m.category) ?? { ing: 0, egr: 0 };
      if (m.type === "ingreso") cur.ing += m.amount; else cur.egr += m.amount;
      map.set(m.category, cur);
    }
    return map;
  };

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Banknote className="h-5 w-5" />}
          label="Efectivo en caja"
          value={balances.cash}
          prev={yBalances.cash}
          tone="cash"
        />
        <MetricCard
          icon={<Wallet className="h-5 w-5" />}
          label="Saldo banco"
          value={balances.bank}
          prev={yBalances.bank}
          tone="bank"
        />
        <MetricCard
          icon={<Coins className="h-5 w-5" />}
          label="Total caja"
          value={balances.total}
          prev={yBalances.cash + yBalances.bank}
          tone="total"
          big
        />
        <MetricCard
          icon={<Sunrise className="h-5 w-5" />}
          label="Inicio del día"
          value={day.initialCash + day.initialBank}
          tone="muted"
        />
      </div>

      {/* Couriers status */}
      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">🛵 Estado domiciliarios hoy</h2>
            <p className="text-sm text-muted-foreground">Toca un chip para ver el detalle</p>
          </div>
          <Link to="/domiciliarios" className="text-sm text-primary font-bold hover:underline">Ver todos →</Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => <CourierChip key={s.worker.id} s={s} />)}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progreso del día</span>
            <span className="font-bold tnum">{okCount} de {totalActive} al día · {progress}%</span>
          </div>
          <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {/* Cash/Bank summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryBreakdown title="💵 Efectivo" map={breakdown("cash")} tone="cash" />
        <CategoryBreakdown title="🏦 Banco" map={breakdown("bank")} tone="bank" />
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, prev, tone, big }: { icon: React.ReactNode; label: string; value: number; prev?: number; tone: "cash" | "bank" | "total" | "muted"; big?: boolean }) {
  const diff = prev != null ? value - prev : 0;
  const toneClasses =
    tone === "cash" ? "shadow-cash text-cash"
    : tone === "bank" ? "shadow-bank text-bank"
    : tone === "total" ? "shadow-cash text-foreground"
    : "text-foreground";
  return (
    <div className={`glass-strong rounded-3xl p-5 ${tone !== "muted" ? toneClasses.split(" ")[0] : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {icon}<span>{label}</span>
      </div>
      <div className={`mt-3 font-black ${big ? "text-4xl" : "text-3xl"} ${toneClasses.includes("text-") ? toneClasses.split(" ").find(c => c.startsWith("text-")) : ""}`}>
        <AnimatedNumber value={value} />
      </div>
      {prev != null && diff !== 0 && (
        <div className={`mt-2 text-xs flex items-center gap-1 ${diff > 0 ? "text-cash" : "text-danger"}`}>
          {diff > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          <span className="tnum">{formatCOP(Math.abs(diff))} vs ayer</span>
        </div>
      )}
    </div>
  );
}

function CourierChip({ s }: { s: ReturnType<typeof courierStatusForDay> & { worker: { id: string; name: string; color: string } } }) {
  const map = {
    ok: { cls: "bg-cash-soft text-cash ring-cash", icon: <CheckCircle2 className="h-4 w-4" />, label: formatCOP(s.totalReturned) },
    debt: { cls: "bg-danger-soft text-danger animate-pulse-warn", icon: <AlertCircle className="h-4 w-4" />, label: `DEBE ${formatCOP(s.totalOwed - s.totalReturned)}` },
    partial: { cls: "bg-warn-soft text-warn", icon: <Clock className="h-4 w-4" />, label: `PARCIAL falta ${formatCOP(s.totalOwed - s.totalReturned)}` },
    idle: { cls: "bg-secondary text-muted-foreground", icon: <CircleDashed className="h-4 w-4" />, label: "sin actividad" },
  }[s.status];
  return (
    <Link to="/domiciliarios" className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold transition hover:scale-105 ${map.cls}`}>
      {map.icon}
      <span>{s.worker.name}</span>
      <span className="tnum opacity-80 font-medium">· {map.label}</span>
    </Link>
  );
}

function CategoryBreakdown({ title, map, tone }: { title: string; map: Map<CategoryCode, { ing: number; egr: number }>; tone: "cash" | "bank" }) {
  const entries: { code: CategoryCode; ing: number; egr: number }[] = [];
  const codes: CategoryCode[] = tone === "cash" ? [1, 5, 7, 13, 3, 9, 11, 15] : [2, 6, 10, 14, 4, 8, 12, 18];
  codes.forEach(c => {
    const v = map.get(c) ?? { ing: 0, egr: 0 };
    entries.push({ code: c, ing: v.ing, egr: v.egr });
  });
  return (
    <div className={`glass-strong rounded-3xl p-5 ${tone === "cash" ? "shadow-cash" : "shadow-bank"}`}>
      <h3 className="font-bold text-lg mb-3">{title}</h3>
      <div className="space-y-1.5">
        {entries.map((e) => {
          const empty = e.ing === 0 && e.egr === 0;
          return (
            <div key={e.code} className={`flex items-center justify-between text-sm py-1.5 px-2 rounded-lg ${empty ? "opacity-40" : ""}`}>
              <span className="truncate">{CATEGORY_LABEL[e.code]}</span>
              <div className="flex gap-3 tnum text-xs">
                {e.ing > 0 && <span className="text-cash font-bold">+{formatCOP(e.ing)}</span>}
                {e.egr > 0 && <span className="text-danger font-bold">-{formatCOP(e.egr)}</span>}
                {empty && <span className="text-muted-foreground">$0</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
