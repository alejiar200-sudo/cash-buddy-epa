"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { todayISO } from "./format";

const Ctx = createContext<{ date: string; setDate: (d: string) => void } | null>(null);

export function DayProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(todayISO);
  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem("epa.day") : null;
    if (stored) setDate(stored);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.setItem("epa.day", date);
  }, [date]);
  return <Ctx.Provider value={{ date, setDate }}>{children}</Ctx.Provider>;
}

export function useDay() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDay must be inside DayProvider");
  return c;
}
