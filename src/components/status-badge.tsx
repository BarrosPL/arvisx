import { CheckCircle2, AlertTriangle, XCircle, Info, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Vocabulario visual unico pra todo "tom" de status do produto (marca, credencial,
 * proposta, execucao, anuncio, teste A/B) - cada dominio continua com seu proprio
 * enum/valor real (nunca mudamos o que o status SIGNIFICA), só centralizamos como ele
 * aparece: sempre rotulo em texto + cor + icone, nunca cor sozinha.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSNAME: Record<StatusTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
  neutral: "border-border bg-muted text-muted-foreground",
};

export const TONE_ICON: Record<StatusTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Circle,
};

export function StatusBadge({
  tone,
  label,
  icon,
  className,
}: {
  tone: StatusTone;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <Badge variant="outline" className={cn("gap-1", TONE_CLASSNAME[tone], className)}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
