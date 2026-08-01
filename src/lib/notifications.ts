import { prisma } from "@/lib/prisma";
import type { StatusTone } from "@/components/status-badge";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/lifecycle";

export interface AttentionEntry {
  key: string;
  tone: StatusTone;
  title: string;
  description?: string;
  /** Abre o chat da JAMILE já perguntando sobre isso. */
  prefill: string;
  createdAt: Date;
  /** Presente só quando a entrada é uma proposta de verdade (não erro de rodada nem
   * veredito de marca) - usado pelo botão de excluir direto do sino. */
  proposalId?: string;
}

function firstRecommendedReason(recommendedActionsJson: unknown): string | undefined {
  if (!Array.isArray(recommendedActionsJson) || recommendedActionsJson.length === 0) return undefined;
  const first = recommendedActionsJson[0];
  if (first && typeof first === "object" && "reason" in first) {
    const reason = (first as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : undefined;
  }
  return undefined;
}

/**
 * Fonte única de "o que precisa da atenção do usuário" - usada pelo sino de
 * notificação (qualquer página, via layout.tsx) e pelo StatCard de propostas
 * pendentes do dashboard. Extraída de dashboard/page.tsx, com uma mudança real de
 * comportamento: toda query de Proposal aqui filtra createdByUserId=null - só
 * proposta originada de rodada pró-ativa/agente autônomo do scheduler vira
 * notificação. Pedido do usuário se ele mesmo pede uma ação no chat, ela executa na
 * hora (ver lib/proposals/chatActions.ts) e nunca deveria sobrar como card - se
 * ficar parada em NEEDS_MORE_DATA (dado insuficiente) ou faltando a imagem de uma
 * NEW_CAMPAIGN, isso é resolvido dentro da própria conversa, não aqui.
 */
export async function getAttentionItems(userId: string): Promise<AttentionEntry[]> {
  const [accounts, latestRun] = await Promise.all([
    prisma.adCredential.findMany({
      where: { providerConnection: { userId } },
      orderBy: { createdAt: "asc" },
      include: {
        rankingSnapshots: { orderBy: { computedAt: "desc" }, take: 1 },
        proposals: {
          where: { createdByUserId: null, status: { in: [...OPEN_PROPOSAL_STATUSES] } },
          orderBy: { createdAt: "desc" },
          include: { executions: { orderBy: { executedAt: "desc" }, take: 1 } },
        },
      },
    }),
    prisma.schedulerRun.findFirst({
      orderBy: { startedAt: "desc" },
      include: {
        accountResults: {
          include: { credential: { select: { id: true, label: true, externalAccountId: true } } },
        },
      },
    }),
  ]);

  const accountName = (account: { label: string | null; externalAccountId: string }) =>
    account.label ?? account.externalAccountId;

  const items: AttentionEntry[] = [];

  for (const account of accounts) {
    const name = accountName(account);
    for (const proposal of account.proposals) {
      if (proposal.status === "EXECUTION_FAILED") {
        items.push({
          key: `exec-${proposal.id}`,
          tone: "danger",
          title: `Falha ao executar: ${proposal.title}`,
          description: proposal.executions[0]?.errorMessage ? `${name} · ${proposal.executions[0].errorMessage}` : name,
          prefill: `Por que a execução da proposta "${proposal.title}" (id: ${proposal.id}, conta: ${name}) falhou?`,
          createdAt: proposal.createdAt,
          proposalId: proposal.id,
        });
      } else if (proposal.status === "NEEDS_MORE_DATA") {
        items.push({
          key: `data-${proposal.id}`,
          tone: "warning",
          title: `Precisa de mais dados: ${proposal.title}`,
          description: name,
          prefill: `Me explica a proposta "${proposal.title}" (id: ${proposal.id}, conta: ${name}) que está aguardando dado.`,
          createdAt: proposal.createdAt,
          proposalId: proposal.id,
        });
      } else {
        items.push({
          key: `proposal-${proposal.id}`,
          tone: "info",
          title: proposal.title,
          description: name,
          prefill: `Me explica a proposta "${proposal.title}" (id: ${proposal.id}, conta: ${name}).`,
          createdAt: proposal.createdAt,
          proposalId: proposal.id,
        });
      }
    }
  }

  if (latestRun) {
    for (const result of latestRun.accountResults) {
      if (result.outcome === "error") {
        const name = accountName(result.credential);
        items.push({
          key: `run-${result.id}`,
          tone: "danger",
          title: `Falha na última análise de ${name}`,
          description: result.errorMessage ?? undefined,
          prefill: `Por que a última análise da conta ${name} falhou?`,
          createdAt: latestRun.startedAt,
        });
      }
    }
  }

  for (const account of accounts) {
    const snapshot = account.rankingSnapshots[0];
    if (snapshot?.verdict === "RUIM") {
      const name = accountName(account);
      const reason = firstRecommendedReason(snapshot.recommendedActionsJson);
      items.push({
        key: `verdict-${account.id}`,
        tone: "warning",
        title: `${name} precisa de atenção`,
        description: reason ? `Diagnóstico: ${reason}` : undefined,
        prefill: `Por que a conta ${name} está com diagnóstico ruim? O que você recomenda?`,
        createdAt: snapshot.computedAt,
      });
    }
  }

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
