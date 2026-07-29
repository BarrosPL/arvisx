import Link from "next/link";
import { BrandAvatar } from "@/components/brand-avatar";
import { StatusBadge } from "@/components/status-badge";
import { TYPE_LABEL } from "@/components/proposal-card";
import { proposalStatusTone } from "@/lib/proposals/status";

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
 * Resumo compacto de uma proposta pra listas cross-marca (dashboard) - detalhe
 * completo (razao, metricas, acoes de decisao) fica so na pagina de propostas da marca.
 */
export function ProposalSummaryRow({
  proposal,
  brand,
}: {
  proposal: ProposalSummaryView;
  brand: ProposalSummaryBrandView;
}) {
  const status = proposalStatusTone(proposal.status);
  return (
    <Link
      href={`/brands/${brand.slug}/proposals`}
      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm transition-colors hover:border-foreground/20"
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
          {new Date(proposal.createdAt).toLocaleDateString("pt-BR")}
        </span>
      </div>
    </Link>
  );
}
