"use client";

import { TONE_ICON, type StatusTone } from "@/components/status-badge";
import { useJamileChat } from "@/components/jamile-launcher";
import { cn } from "@/lib/utils";

const TONE_ICON_CLASSNAME: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-primary",
  neutral: "text-muted-foreground",
};

/**
 * Item de "Atenção necessária" - clicar abre o chat da JAMILE já perguntando sobre o
 * assunto (`prefill`), em vez de navegar pra uma página. Decisão do Renan: toda a
 * árvore de decisão (inclusive entender o que precisa de atenção) passa pelo chat.
 */
export function AttentionItem({
  tone,
  title,
  description,
  prefill,
}: {
  tone: StatusTone;
  title: string;
  description?: string;
  prefill: string;
}) {
  const { openChat } = useJamileChat();
  const Icon = TONE_ICON[tone];
  return (
    <button
      type="button"
      onClick={() => openChat({ prefill })}
      className="flex w-full items-start gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-foreground/20"
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_ICON_CLASSNAME[tone])} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        {description ? (
          <span className="truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
      </div>
    </button>
  );
}
