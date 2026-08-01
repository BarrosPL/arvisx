"use client";

import { useState } from "react";
import { ProposalCard, type ProposalView, type ProposalAccountView } from "@/components/proposal-card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

interface Group {
  key: string;
  label: string;
  statuses: string[];
}

const GROUPS: Group[] = [
  { key: "awaiting", label: "Aguardando decisão", statuses: ["PENDING", "NEEDS_MORE_DATA"] },
  { key: "test", label: "Em teste", statuses: ["TEST"] },
  { key: "approved", label: "Aprovadas / execução", statuses: ["APPROVED"] },
  { key: "adjust", label: "Ajustar", statuses: ["ADJUST"] },
  { key: "failed", label: "Falhas", statuses: ["EXECUTION_FAILED"] },
  { key: "history", label: "Histórico", statuses: ["EXECUTED", "REJECTED"] },
];

/** Ordem de prioridade pra escolher a aba inicial - falha real vem primeiro, historico por ultimo. */
const DEFAULT_PRIORITY = ["failed", "awaiting", "adjust", "test", "approved", "history"];

/**
 * Agrupa propostas por status em abas, sem mudar a classificacao real de nenhuma -
 * so reorganiza a apresentacao. ProposalCard é só leitura (histórico/auditoria) -
 * decisão/execução acontece conversando com a JAMILE, não mais aqui.
 *
 * `account` por item: a pagina de propostas mistura contas de anuncio diferentes,
 * entao cada proposta carrega o nome da conta a que pertence (ProposalCard so mostra
 * quando presente).
 */
export function ProposalsBoard({ proposals }: { proposals: (ProposalView & { account?: ProposalAccountView })[] }) {
  const countByGroup = new Map(
    GROUPS.map((group) => [group.key, proposals.filter((p) => group.statuses.includes(p.status)).length])
  );

  const initialKey = DEFAULT_PRIORITY.find((key) => (countByGroup.get(key) ?? 0) > 0) ?? "awaiting";
  const [active, setActive] = useState(initialKey);

  const activeGroup = GROUPS.find((g) => g.key === active)!;
  const filtered = proposals.filter((p) => activeGroup.statuses.includes(p.status));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((group) => {
          const count = countByGroup.get(group.key) ?? 0;
          const isActive = group.key === active;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => setActive(group.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {group.label}
              <span
                className={cn(
                  "flex min-w-5 items-center justify-center rounded-full px-1 text-xs",
                  isActive ? "bg-primary/15" : "bg-muted"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={`Nenhuma proposta em "${activeGroup.label}"`}
          description="Novas propostas aparecem aqui automaticamente conforme a JAMILE analisa suas contas."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} account={proposal.account} />
          ))}
        </div>
      )}
    </div>
  );
}
