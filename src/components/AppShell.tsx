import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useDay } from "@/lib/day-context";
import { useStore } from "@/lib/store";
import { prettyDate, shiftDate, todayISO } from "@/lib/format";
import { ChevronLeft, ChevronRight, Plus, Sunrise, Lock } from "lucide-react";
import { NewMovementWizard } from "./wizards/NewMovementWizard";
import { WelcomeWizard } from "./wizards/WelcomeWizard";

export function AppShell({ children }: { children: ReactNode }) {
  const { date, setDate } = useDay();
  const { state, ensureDay, getDay } = useStore();
  const [newOpen, setNewOpen] = useState(false);

  if (!state.settings.setupComplete) {
    return <WelcomeWizard />;
  }

  const isToday = date === todayISO();
  const day = getDay(date);
  const dayExists = !!state.days[date];

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 glass-strong border-b border-border px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="p-2 rounded-lg hover:bg-secondary transition"
            title="Día anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 flex flex-col items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {isToday ? "Hoy" : ""}
            </div>
            <div className="text-lg font-bold capitalize">{prettyDate(date)}</div>
          </div>
          <button
            onClick={() => setDate(shiftDate(date, +1))}
            className="p-2 rounded-lg hover:bg-secondary transition"
            title="Día siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isToday ? "bg-cash-soft text-cash" : "bg-muted text-muted-foreground"
          }`}>
            {isToday ? <Sunrise className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {isToday ? "Día en curso" : "Día cerrado"}
          </div>

          <button
            onClick={() => { ensureDay(date); setNewOpen(true); }}
            className="ml-2 flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl shadow-cash hover:scale-[1.02] active:scale-[0.98] transition"
          >
            <Plus className="h-5 w-5" />
            Nuevo movimiento
          </button>
        </header>

        <div className="flex-1 p-6">{children}</div>
      </main>

      <NewMovementWizard open={newOpen} onOpenChange={setNewOpen} date={date} />
      {/* day reference to avoid unused */}
      <span className="hidden">{day.date}{dayExists ? "" : ""}</span>
    </div>
  );
}
