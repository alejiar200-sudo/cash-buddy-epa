"use client";

import { useState, useMemo } from "react";
import { useStore, dayBalances } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { formatCOP, prettyDate } from "@/lib/format";
import { Calendar, Table as TableIcon, X } from "lucide-react";

export default function HistoryPage() {
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { state } = useStore();
  const { setDate } = useDay();
  const [openDate, setOpenDate] = useState<string | null>(null);

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const arr: { date: string; balances: ReturnType<typeof dayBalances> | null; status: "ok" | "warn" | "danger" | "empty" }[] = [];
    for (let d = 1; d <= last; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const day = state.days[date];
      if (!day) { arr.push({ date, balances: null, status: "empty" }); continue; }
      const bal = dayBalances(day);
      const hasPending = day.movements.some(m => m.status === "pending");
      const arqueoDiff = ((day.arqueoClose?.bills ?? 0) + (day.arqueoClose?.coins ?? 0) + (day.arqueoClose?.bank ?? 0)) - (bal.cash + bal.bank);
      const status: "ok" | "warn" | "danger" = arqueoDiff !== 0 && day.arqueoClose ? "danger" : hasPending ? "warn" : "ok";
      arr.push({ date, balances: bal, status });
    }
    return arr;
  }, [month, state.days]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📅 Historial</h1>
        <div className="flex glass-strong rounded-xl p-1">
          <button onClick={() => setView("calendar")} className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold ${view === "calendar" ? "bg-primary text-primary-foreground" : ""}`}>
            <Calendar className="h-4 w-4" /> Calendario
          </button>
          <button onClick={() => setView("table")} className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold ${view === "table" ? "bg-primary text-primary-foreground" : ""}`}>
            <TableIcon className="h-4 w-4" /> Tabla
          </button>
        </div>
      </div>

      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="glass rounded-xl px-4 py-2 outline-none" />

      {view === "calendar" ? (
        <div className="grid grid-cols-7 gap-2">
          {days.map(d => {
            const cls =
              d.status === "ok" ? "bg-cash-soft text-cash" :
              d.status === "warn" ? "bg-warn-soft text-warn" :
              d.status === "danger" ? "bg-danger-soft text-danger" :
              "bg-secondary text-muted-foreground";
            const dayNum = parseInt(d.date.slice(-2), 10);
            return (
              <button
                key={d.date}
                onClick={() => d.balances && setOpenDate(d.date)}
                className={`aspect-square rounded-2xl p-2 text-left transition hover:scale-105 ${cls}`}
              >
                <div className="text-2xl font-black">{dayNum}</div>
                {d.balances && <div className="text-[10px] tnum mt-1">{formatCOP(d.balances.total)}</div>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="glass-strong rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left p-3">Fecha</th>
                <th className="text-right p-3">Inicio</th>
                <th className="text-right p-3">Saldo efectivo</th>
                <th className="text-right p-3">Saldo banco</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.filter(d => d.balances).map(d => (
                <tr key={d.date} className="border-b border-border/40 hover:bg-secondary/30 cursor-pointer" onClick={() => { setDate(d.date); }}>
                  <td className="p-3 text-sm">{d.date}</td>
                  <td className="p-3 text-right tnum text-sm text-muted-foreground">{formatCOP((state.days[d.date].initialCash) + (state.days[d.date].initialBank))}</td>
                  <td className="p-3 text-right tnum text-cash font-bold">{formatCOP(d.balances!.cash)}</td>
                  <td className="p-3 text-right tnum text-bank font-bold">{formatCOP(d.balances!.bank)}</td>
                  <td className="p-3 text-right tnum font-black">{formatCOP(d.balances!.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openDate && state.days[openDate] && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenDate(null)}>
          <div className="glass-strong rounded-3xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold capitalize">{prettyDate(openDate)}</h3>
              <button onClick={() => setOpenDate(null)} className="p-2 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <DayDetail date={openDate} />
            <button onClick={() => { setDate(openDate); setOpenDate(null); }} className="mt-5 w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-cash">
              Ir a ese día →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DayDetail({ date }: { date: string }) {
  const { state } = useStore();
  const day = state.days[date];
  const bal = dayBalances(day);
  const ing = day.movements.filter(m => m.type === "ingreso" && m.status === "confirmed").reduce((s, m) => s + m.amount, 0);
  const egr = day.movements.filter(m => m.type === "egreso" && m.status === "confirmed").reduce((s, m) => s + m.amount, 0);
  return (
    <div className="space-y-2 tnum text-sm">
      <Detail label="Inicio del día" value={day.initialCash + day.initialBank} />
      <Detail label="Total ingresos" value={ing} tone="cash" />
      <Detail label="Total egresos" value={-egr} tone="danger" />
      <div className="border-t border-border my-2" />
      <Detail label="💵 Efectivo final" value={bal.cash} tone="cash" />
      <Detail label="🏦 Banco final" value={bal.bank} tone="bank" />
      <Detail label="💰 Total general" value={bal.total} big />
    </div>
  );
}

function Detail({ label, value, tone, big }: { label: string; value: number; tone?: "cash" | "bank" | "danger"; big?: boolean }) {
  const color = tone === "cash" ? "text-cash" : tone === "bank" ? "text-bank" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="flex items-center justify-between">
      <span className={big ? "font-bold" : "text-muted-foreground"}>{label}</span>
      <span className={`${color} font-black ${big ? "text-xl" : ""}`}>{formatCOP(value)}</span>
    </div>
  );
}
