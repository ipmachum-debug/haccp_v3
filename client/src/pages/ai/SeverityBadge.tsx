import { Badge } from "@/components/ui/badge";
import { SEVERITY_CONFIG } from "./types";

export function SeverityBadge({ severity }: { severity: string }) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} text-xs font-medium gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
