"use client";

import { useState, useMemo, useEffect } from "react";
import { useDay } from "@/lib/day-context";
import { formatCOP, prettyDate } from "@/lib/format";
import * as api from "@/lib/sd-api";
import { Calendar, Table as TableIcon, X } from "lucide-react";

export default function HistoryPage() {
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { setDate } = useDay();
  const [openDate, setOpenDate] = useState<string | null>(null);
  // Resúmenes REALES por día del mes visible (saldos autoritativos: los mismos que la
  // Caja/Cierre — cuentan banco, domiciliarios, bases y deudas, no solo la Caja vieja).
  // La apertura de cada día es el cierre real del día anterior, así ya no hay dos días
  // seguidos con el mismo saldo inicial "arrastrado" por error.
  const [summaries, setSummaries] = useState<Record<string, api.DaySummary>>({});

  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${month}-01`;
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;
    let alive = true;
    setSummaries({});
    api.getDaySummaries(from, to).then(list => {
      if (!alive) return;
      const map: Record<string, api.DaySummary> = {};
      for (const s of list) map[s.date] = s;
      setSummaries(map);
    }).catch(() => {});
    return () => { alive = false; };
  }, [month]);

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const arr: { date: string; summary: api.DaySummary | null; status: "ok" | "warn" | "danger" | "empty" }[] = [];
    for (let d = 1; d <= last; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const summary = summaries[date] ?? null;
      // El semáforo verde/rojo depende ÚNICA Y EXCLUSIVAMENTE del Cierre del día
      // (cajaCuadrada), no del resto de las cifras.
      let status: "ok" | "warn" | "danger" | "empty";
      if (summary?.hasClose) status = summary.cajaCuadrada ? "ok" : "danger";
      else if (summary?.hasActivity) status = "warn";
      else status = "empty";
      arr.push({ date, summary, status });
    }
    return arr;
  }, [month, summaries]);

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
                onClick={() => setOpenDate(d.date)}
                className={`aspect-square rounded-2xl p-2 text-left transition hover:scale-105 ${cls}`}
              >
                <div className="text-2xl font-black">{dayNum}</div>
                {d.summary?.hasActivity && <div className="text-[10px] tnum mt-1">{formatCOP(d.summary.finalTotal)}</div>}
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
              {days.filter(d => d.summary?.hasActivity).map(d => (
                <tr key={d.date} className="border-b border-border/40 hover:bg-secondary/30 cursor-pointer" onClick={() => { setDate(d.date); }}>
                  <td className="p-3 text-sm">{d.date}</td>
                  <td className="p-3 text-right tnum text-sm text-muted-foreground">{formatCOP(d.summary!.initialTotal)}</td>
                  <td className="p-3 text-right tnum text-cash font-bold">{formatCOP(d.summary!.finalCash)}</td>
                  <td className="p-3 text-right tnum text-bank font-bold">{formatCOP(d.summary!.finalBank)}</td>
                  <td className="p-3 text-right tnum font-black">{formatCOP(d.summary!.finalTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openDate && (
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
  const [summary, setSummary] = useState<api.DaySummary | null>(null);

  useEffect(() => {
    let alive = true;
    setSummary(null);
    api.getDaySummary(date).then(s => { if (alive) setSummary(s); }).catch(() => {});
    return () => { alive = false; };
  }, [date]);

  if (!summary) return <div className="text-center py-8 text-sm text-muted-foreground">Cargando…</div>;

  // Día sin ninguna actividad: no se inventa saldo arrastrado, se muestra vacío.
  if (!summary.hasActivity) {
    return (
      <div className="text-center py-10 space-y-2">
        <div className="text-4xl">📭</div>
        <p className="font-bold">Día sin movimientos</p>
        <p className="text-sm text-muted-foreground">No se registró nada este día.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 tnum text-sm">
      {/* El único criterio de "cuadró": el Cierre registrado ese día. */}
      <div className={`rounded-xl p-3 text-center font-bold ${
        summary.cajaCuadrada ? "bg-cash-soft text-cash" : summary.hasClose ? "bg-danger-soft text-danger" : "bg-secondary text-muted-foreground"
      }`}>
        {summary.cajaCuadrada ? "✅ Caja cuadrada" : summary.hasClose ? "⚠️ Caja no cuadró" : "⏳ Sin cierre registrado"}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Inicio del día</p>
        <Detail label="💵 Efectivo" value={summary.initialCash} tone="cash" />
        <Detail label="🏦 Banco" value={summary.initialBank} tone="bank" />
        <Detail label="Total" value={summary.initialTotal} />
      </div>

      <div className="border-t border-border my-1" />

      <div className="space-y-1">
        <Detail label="↑ Ingresos" value={summary.ingresos} tone="cash" />
        <Detail label="↓ Salidas" value={-summary.egresos} tone="danger" />
        <Detail label="Comisión de domicilios" value={summary.comision} tone="cash" />
        <Detail label="Deudas de clientes generadas" value={summary.deudasGeneradas} />
        {summary.deudasCobradas > 0 && <Detail label="Deudas de clientes cobradas" value={summary.deudasCobradas} tone="cash" />}
      </div>

      <div className="border-t border-border my-1" />

      <div className="space-y-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Queda en caja</p>
        <Detail label="💵 Efectivo" value={summary.finalCash} tone="cash" />
        <Detail label="🏦 Banco" value={summary.finalBank} tone="bank" />
        <Detail label="💰 Total en caja" value={summary.finalTotal} big />
      </div>

      <div className="border-t border-border my-1" />

      <Detail label="📈 Ganancia de la empresa" value={summary.netProfit} tone={summary.netProfit >= 0 ? "cash" : "danger"} big />
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
