"use client";

import { BrandAvatar } from "@/components/brand-avatar";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { useJamileChat } from "@/components/jamile-launcher";
import { formatCurrency } from "@/lib/format";

export interface BrandSummaryView {
  id: string;
  name: string;
  slug: string;
  verdictLabel: string | null;
  verdictTone: StatusTone;
  spend: number;
  openProposalsCount: number;
}

/**
 * Linha compacta de uma marca no resumo narrado da home - clicar abre o chat da
 * JAMILE já perguntando sobre essa marca, em vez de navegar pra uma página. A marca
 * deixou de ser o ponto de entrada principal do app (decisão do Renan) - continua
 * dando pra trocar de marca pela sidebar quando fizer sentido acessar algo
 * inerentemente não-conversacional (conectar conta, configurações).
 */
export function BrandSummaryRow({ brand }: { brand: BrandSummaryView }) {
  const { openChat } = useJamileChat();
  return (
    <button
      type="button"
      onClick={() => openChat({ prefill: `Como está a marca ${brand.name}?` })}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-foreground/20"
    >
      <div className="flex min-w-0 items-center gap-3">
        <BrandAvatar name={brand.name} seed={brand.id} size="sm" />
        <span className="truncate text-sm font-medium">{brand.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{brand.spend > 0 ? `${formatCurrency(brand.spend)} investidos` : "sem dados coletados"}</span>
        {brand.openProposalsCount > 0 ? (
          <span>{brand.openProposalsCount} proposta(s)</span>
        ) : null}
        <StatusBadge tone={brand.verdictTone} label={brand.verdictLabel ?? "Sem dados"} />
      </div>
    </button>
  );
}
