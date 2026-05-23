import { useEffect, useRef } from "react";
import { formatCOP } from "@/lib/format";

interface Props {
  value: number;
  onChange: (n: number) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export function MoneyInput({ value, onChange, autoFocus, placeholder }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  return (
    <div className="relative">
      <input
        ref={ref}
        inputMode="numeric"
        type="text"
        value={value === 0 ? "" : formatCOP(value).replace("$", "")}
        placeholder={placeholder ?? "0"}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? parseInt(digits, 10) : 0);
        }}
        className="w-full glass-strong rounded-2xl px-6 py-5 text-4xl font-bold tnum text-center text-cash outline-none focus:ring-2 focus:ring-primary/60 transition"
      />
      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-cash/60 pointer-events-none">$</span>
    </div>
  );
}
