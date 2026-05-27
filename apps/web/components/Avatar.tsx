import type { Worker } from "@/lib/store";

export function Avatar({ worker, size = 40 }: { worker?: Pick<Worker, "name" | "color">; size?: number }) {
  if (!worker) return null;
  const initial = worker.name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-background shrink-0"
      style={{ background: worker.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
