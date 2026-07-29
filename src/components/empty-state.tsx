import { cn } from "@/lib/utils";

/**
 * Estado vazio padrao: o que esta vazio, por que pode estar vazio, e qual e o
 * proximo passo - os 3 pontos pedidos explicitamente, em vez de um texto solto tipo
 * "Nenhum item encontrado" sem contexto nem saida.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="max-w-sm text-sm text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
