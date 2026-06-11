import { type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
}

export function WizardShell({ open, onOpenChange, step, total, title, subtitle, children, onBack }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 bg-card border-border rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 pt-5 pb-4 border-b border-border flex items-center gap-3 shrink-0">
          {onBack ? (
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-secondary">
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : <div className="w-8" />}
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Paso {step} de {total}
            </div>
            <div className="flex gap-1 mt-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-secondary"}`} />
              ))}
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-6 overflow-y-auto flex-1">
          <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
