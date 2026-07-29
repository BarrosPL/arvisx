import { cn } from "@/lib/utils";

type StatTone = "default" | "success" | "warning" | "danger";

const TONE_ICON_CLASSNAME: Record<StatTone, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

/**
 * Indicador do dashboard (label + valor + icone + contexto) - generaliza os 4 tiles
 * que ja existiam soltos em dashboard/page.tsx pra reuso em outras paginas. Sem
 * comparacao percentual inventada - "context" so aparece quando quem chama tem um
 * dado real pra mostrar.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  context,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  context?: React.ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
        {Icon ? (
          <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", TONE_ICON_CLASSNAME[tone])}>
            <Icon className="size-3.5" />
          </div>
        ) : null}
      </div>
      <span className="text-[28px] leading-none font-semibold tracking-tight text-balance">{value}</span>
      {context ? <span className="text-xs text-muted-foreground">{context}</span> : null}
    </div>
  );
}
