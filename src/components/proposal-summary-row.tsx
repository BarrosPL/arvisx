"use client";

import { BrandAvatar } from "@/components/brand-avatar";
import { StatusBadge } from "@/components/status-badge";
import { TYPE_LABEL } from "@/components/proposal-card";
import { proposalStatusTone } from "@/lib/proposals/status";
import { useJamileChat } from "@/components/jamile-launcher";
import { formatDate } from "@/lib/format";

export interface ProposalSummaryView {
  id: string;
  type: string;
  title: string;
  status: string;
  platform: string | null;
  createdAt: string;
}

export interface ProposalSummaryBrandView {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resumo compacto de uma proposta pra listas cross-marca (dashboard) - clicar abre o
 * chat da JAMILE já perguntando sobre essa proposta especificamente (a decisão de
 * verdade acontece por lá, não numa página de detalhe).
 */
export function ProposalSummaryRow({
  proposal,
  brand,
}: {
  proposal: ProposalSummaryView;
  brand: ProposalSummaryBrandView;
}) {
  const { openChat } = useJamileChat();
  const status = proposalStatusTone(proposal.status);
  return (
    <button
      type="button"
      onClick={() =>
        openChat({ prefill: `Me explica a proposta "${proposal.title}" (id: ${proposal.id}, marca: ${brand.name}).` })
      }
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-foreground/20"
    >
      <div className="flex min-w-0 items-center gap-3">
        <BrandAvatar name={brand.name} seed={brand.id} size="xs" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{proposal.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {brand.name} · {TYPE_LABEL[proposal.type] ?? proposal.type}
            {proposal.platform ? ` · ${proposal.platform}` : ""}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge tone={status.tone} label={status.label} />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {formatDate(new Date(proposal.createdAt))}
        </span>
      </div>
    </button>
  );
}
