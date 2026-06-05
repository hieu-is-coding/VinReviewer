import { ChevronDown, ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  sectionKey: string;
  expanded: boolean;
  toggle: (key: string) => void;
}

export function SectionHeader({ icon: Icon, title, subtitle, sectionKey, expanded, toggle }: SectionHeaderProps) {
  return (
    <button onClick={() => toggle(sectionKey)} className="w-full flex items-center gap-3 group">
      <Icon className="h-5 w-5 text-primary" />
      <div className="text-left flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
