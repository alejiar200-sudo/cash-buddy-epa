"use client";

import { useState } from "react";
import { useStore, dayBalances, type Arqueo } from "@/lib/store";
import { useDay } from "@/lib/day-context";
import { formatCOP } from "@/lib/format";
import { ChevronDown, Sunrise, Sun, Lock, CheckCircle2, AlertTriangle } from "lucide-react";

export default function ArqueosPage() {
  const { date } = useDay();
  const { getDay } = useStore();
  const day = getDay(date);
  const bal = dayBalances(day);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">🔒 Arqueos de caja</h1>
      <p className="text-muted-foreground text-sm">Cuenta tus billetes, monedas y banco para verificar que todo cuadra</p>

      <Section title="Recibo AM" icon={<Sunrise className="h-5 w-5" />} which="arqueoAM" slot="AM" systemCash={bal.cash} systemBank={bal.bank} />
      <Section title="Recibo PM" icon={<Sun className="h-5 w-5" />} which="arqueoPM" slot="PM" systemCash={bal.cash} systemBank={bal.bank} />
      <Section title="Cierre" icon={<Lock className="h-5 w-5" />} which="arqueoClose" slot="close" systemCash={bal.cash} systemBank={bal.bank} />
    </div>
  );
}

function Section({ title, icon, which, slot, systemCash, systemBank }: {
  title: string; icon: React.ReactNode;
  which: "arqueoAM" | "arqueoPM" | "arqueoClose";
  slot: "AM" | "PM" | "close";
  systemCash: number; systemBank: number;
}) {
  const { setArqueo, getDay } = useStore();
  const { date } = useDay();
  const day = getDay(date);
  const persisted: Arqueo = day[which] ?? {};
  const [a, setA] = useState<Arqueo>(persisted);
  const [open, setOpen] = useState(false);

  function update(patch: Partial<Arqueo>) {
    setA((prev) => ({ ...prev, ...patch }));
  }

  function persist() {
    void setArqueo(date, slot, a);
  }

  const countedCash = (a.bills ?? 0) + (a.coins ?? 0);
  const countedBank = a.bank ?? 0;
  const countedTotal = countedCash + countedBank;
  const systemTotal = systemCash + systemBank;
  const diff = countedTotal - systemTotal;
  const hasData = a.bills != null || a.coins != null || a.bank != null;

  return (
    <div className="glass-strong rounded-3xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-5 hover:bg-secondary/30">
        <div className="p-2 rounded-xl bg-cash-soft text-cash">{icon}</div>
        <div className="flex-1 text-left">
          <div className="font-bold text-lg">🌅 {title}</div>
          {hasData && (
            diff === 0
              ? <div className="text-xs text-cash">✅ Cuadra perfecto</div>
              : <div className="text-xs text-warn">⚠️ Diferencia {formatCOP(Math.abs(diff))}</div>
          )}
        </div>
        <ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-5 border-t border-border space-y-4 animate-slide-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="💵 Billetes" value={a.bills ?? 0} onChange={(v) => update({ bills: v })} onBlur={persist} />
            <Field label="🪙 Monedas" value={a.coins ?? 0} onChange={(v) => update({ coins: v })} onBlur={persist} />
            <Field label="🏦 Banco" value={a.bank ?? 0} onChange={(v) => update({ bank: v })} onBlur={persist} />
          </div>
          <div className="glass rounded-2xl p-4 space-y-2 tnum">
            <Row label="📊 Total contado" value={countedTotal} />
            <Row label="💻 Sistema dice" value={systemTotal} muted />
            <div className="border-t border-border my-2" />
            {diff === 0 && hasData ? (
              <div className="flex items-center gap-2 text-cash font-bold"><CheckCircle2 className="h-5 w-5" /> ¡Cuadra perfecto!</div>
            ) : hasData ? (
              <div className="flex items-center gap-2 text-warn font-bold">
                <AlertTriangle className="h-5 w-5" /> Diferencia de {formatCOP(Math.abs(diff))} {diff > 0 ? "(sobra)" : "(falta)"}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Ingresa los valores para verificar</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, onBlur }: { label: string; value: number; onChange: (n: number) => void; onBlur?: () => void }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      <input
        type="text" inputMode="numeric"
        value={value === 0 ? "" : value.toLocaleString("es-CO")}
        onChange={(e) => onChange(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))}
        onBlur={onBlur}
        className="w-full glass rounded-xl px-4 py-3 tnum text-lg font-bold outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground text-sm" : "font-bold"}>{label}</span>
      <span className={`font-black tnum ${muted ? "text-muted-foreground" : ""}`}>{formatCOP(value)}</span>
    </div>
  );
}
