import type { LucideIcon } from "lucide-react";

interface MiniStatProps {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: string;
}

export function MiniStat({ label, value, icon: Icon, color }: MiniStatProps) {
  return (
    <div className="bg-card rounded-lg shadow-card border border-border p-3">
      <div className="flex items-center gap-2 mb-0.5">
        <Icon className={`h-3.5 w-3.5 ${color || "text-muted-foreground"}`} />
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}
