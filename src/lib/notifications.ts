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
  const [brands, latestRun] = await Promise.all([
    prisma.brand.findMany({
      where: { brandAccess: { some: { userId } } },
      orderBy: { priorityOrder: "asc" },
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
      include: { brandResults: { include: { brand: { select: { id: true, name: true, slug: true } } } } },
    }),
  ]);

  const items: AttentionEntry[] = [];

  for (const brand of brands) {
    for (const proposal of brand.proposals) {
      if (proposal.status === "EXECUTION_FAILED") {
        items.push({
          key: `exec-${proposal.id}`,
          tone: "danger",
          title: `Falha ao executar: ${proposal.title}`,
          description: proposal.executions[0]?.errorMessage ? `${brand.name} · ${proposal.executions[0].errorMessage}` : brand.name,
          prefill: `Por que a execução da proposta "${proposal.title}" (id: ${proposal.id}, marca: ${brand.name}) falhou?`,
          createdAt: proposal.createdAt,
          proposalId: proposal.id,
        });
      } else if (proposal.status === "NEEDS_MORE_DATA") {
        items.push({
          key: `data-${proposal.id}`,
          tone: "warning",
          title: `Precisa de mais dados: ${proposal.title}`,
          description: brand.name,
          prefill: `Me explica a proposta "${proposal.title}" (id: ${proposal.id}, marca: ${brand.name}) que está aguardando dado.`,
          createdAt: proposal.createdAt,
          proposalId: proposal.id,
        });
      } else {
        items.push({
          key: `proposal-${proposal.id}`,
          tone: "info",
          title: proposal.title,
          description: brand.name,
          prefill: `Me explica a proposta "${proposal.title}" (id: ${proposal.id}, marca: ${brand.name}).`,
          createdAt: proposal.createdAt,
          proposalId: proposal.id,
        });
      }
    }
  }

  if (latestRun) {
    for (const result of latestRun.brandResults) {
      if (result.outcome === "error") {
        items.push({
          key: `run-${result.id}`,
          tone: "danger",
          title: `Falha na última análise de ${result.brand.name}`,
          description: result.errorMessage ?? undefined,
          prefill: `Por que a última análise da marca ${result.brand.name} falhou?`,
          createdAt: latestRun.startedAt,
        });
      }
    }
  }

  for (const brand of brands) {
    const snapshot = brand.rankingSnapshots[0];
    if (snapshot?.verdict === "RUIM") {
      const reason = firstRecommendedReason(snapshot.recommendedActionsJson);
      items.push({
        key: `verdict-${brand.id}`,
        tone: "warning",
        title: `${brand.name} precisa de atenção`,
        description: reason ? `Diagnóstico: ${reason}` : undefined,
        prefill: `Por que a marca ${brand.name} está com diagnóstico ruim? O que você recomenda?`,
        createdAt: snapshot.computedAt,
      });
    }
  }

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
