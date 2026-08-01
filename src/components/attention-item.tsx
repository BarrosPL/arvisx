"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, X, Check } from "lucide-react";
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
 *
 * `proposalId` (opcional - nem toda entrada de atenção é uma proposta, ex: erro de
 * rodada do scheduler ou veredito ruim de conta) habilita um botão de excluir de
 * verdade, direto daqui - antes só dava pra apagar uma proposta pedindo pra JAMILE no
 * chat. Mesmo padrão de confirmação inline e tratamento de erro que
 * proposal-card.tsx já usa (a rota já bloqueia excluir proposta já executada,
 * devolvendo uma mensagem clara).
 */
export function AttentionItem({
  tone,
  title,
  description,
  prefill,
  proposalId,
  onClick,
}: {
  tone: StatusTone;
  title: string;
  description?: string;
  prefill: string;
  proposalId?: string;
  /** Chamado junto do clique, antes de abrir o chat - ex: fechar um popover que contém este item. */
  onClick?: () => void;
}) {
  const { openChat } = useJamileChat();
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const Icon = TONE_ICON[tone];

  async function handleDelete() {
    if (!proposalId) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao excluir proposta.");
        return;
      }
      toast.success("Notificação excluída.");
      router.refresh();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (confirmingDelete) {
    return (
      <div className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <Icon className={cn("size-4 shrink-0", TONE_ICON_CLASSNAME[tone])} />
        <span className="min-w-0 flex-1 truncate text-sm">Excluir esta notificação de vez?</span>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => setConfirmingDelete(false)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={handleDelete}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
        >
          <Check className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start gap-1">
      <button
        type="button"
        onClick={() => {
          onClick?.();
          openChat({ prefill });
        }}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-foreground/20"
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_ICON_CLASSNAME[tone])} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {description ? (
            <span className="truncate text-xs text-muted-foreground">{description}</span>
          ) : null}
        </div>
      </button>
      {proposalId ? (
        <button
          type="button"
          aria-label="Excluir notificação"
          onClick={(event) => {
            event.stopPropagation();
            setConfirmingDelete(true);
          }}
          className="flex size-8 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
