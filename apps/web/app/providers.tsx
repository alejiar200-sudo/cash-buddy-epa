"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { DayProvider } from "@/lib/day-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreProvider>
        <DayProvider>
          {children}
          <Toaster position="top-right" theme="dark" richColors />
        </DayProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
