"use client";

import { useState } from "react";
import { useStore, CATEGORY_LABEL, type Movement } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { Avatar } from "@/components/Avatar";
import { formatCOP } from "@/lib/format";
import { Search, Check, Trash2 } from "lucide-react";

type Filter = "all" | "cash" | "bank" | "pending" | "confirmed";

export default function MovementsPage() {
  const { state, getDay, updateMovement, deleteMovement } = useStore();
  const { date } = useDay();
  const day = getDay(date);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const filtered = day.movements
    .slice()
    .reverse()
    .filter((m) => {
      if (filter === "cash") return m.medium === "cash";
      if (filter === "bank") return m.medium === "bank";
      if (filter === "pending") return m.status === "pending";
      if (filter === "confirmed") return m.status === "confirmed";
      return true;
    })
    .filter((m) => {
      if (!q) return true;
      const w = state.workers.find((x) => x.id === m.workerId);
      return (m.description ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (w?.name.toLowerCase().includes(q.toLowerCase()) ?? false);
    });

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "cash", label: "💵 Efectivo" },
    { id: "bank", label: "🏦 Banco" },
    { id: "pending", label: "⏳ Pendientes" },
    { id: "confirmed", label: "✅ Confirmados" },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">📋 Movimientos del día</h1>

      <div className="flex flex-wrap gap-2 items-center">
        {chips.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} className={`px-4 py-2 rounded-full text-sm font-bold transition ${filter === c.id ? "bg-primary text-primary-foreground shadow-cash" : "bg-secondary text-foreground hover:bg-muted"}`}>
            {c.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" className="pl-9 pr-4 py-2 glass rounded-xl outline-none text-sm w-64" />
        </div>
      </div>

      <div className="glass-strong rounded-3xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">Sin movimientos aún hoy</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left p-3">Hora</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-left p-3">Descripción</th>
                <th className="text-left p-3">Trabajador</th>
                <th className="text-right p-3">Monto</th>
                <th className="text-center p-3">Estado</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => <Row key={m.id} m={m} date={date} update={updateMovement} del={deleteMovement} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({ m, date, update, del }: {
  m: Movement;
  date: string;
  update: (date: string, id: string, patch: Partial<Movement>) => void;
  del: (date: string, id: string) => void;
}) {
  const { state } = useStore();
  const worker = state.workers.find(w => w.id === m.workerId);
  const isPending = m.status === "pending";
  const rowCls = isPending ? "bg-warn-soft/30" : "";
  const amountCls = m.type === "ingreso" ? "text-cash" : "text-danger";
  const sign = m.type === "ingreso" ? "+" : "-";
  return (
    <tr className={`border-b border-border/40 ${rowCls} animate-slide-in`}>
      <td className="p-3 text-sm tnum text-muted-foreground">{m.time}</td>
      <td className="p-3 text-sm">{m.medium === "cash" ? "💵" : "🏦"} {CATEGORY_LABEL[m.category]}</td>
      <td className="p-3 text-sm">{m.description ?? "—"}</td>
      <td className="p-3">
        {worker ? (
          <div className="flex items-center gap-2">
            <Avatar worker={worker} size={24} />
            <span className="text-sm">{worker.name}</span>
          </div>
        ) : "—"}
      </td>
      <td className={`p-3 text-right font-black tnum ${amountCls}`}>{sign}{formatCOP(m.amount)}</td>
      <td className="p-3 text-center">
        {isPending
          ? <span className="text-xs bg-warn-soft text-warn px-2 py-1 rounded-full font-bold">⏳ Pendiente</span>
          : <span className="text-xs bg-cash-soft text-cash px-2 py-1 rounded-full font-bold">✅ Confirmado</span>}
      </td>
      <td className="p-3 text-right space-x-1">
        {isPending && (
          <button onClick={() => update(date, m.id, { status: "confirmed" })} className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg">
            <Check className="h-3 w-3" /> Recibí
          </button>
        )}
        <button onClick={() => del(date, m.id)} className="inline-flex items-center text-danger p-1.5 hover:bg-danger-soft rounded-lg">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
