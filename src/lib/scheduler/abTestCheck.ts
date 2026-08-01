import { prisma } from "@/lib/prisma";
import type { AbTest } from "@/generated/prisma/client";
import { evaluateProposalReadiness, deriveInitialStatus } from "@/lib/proposals/dataEnforcement";
import { formatCurrency, formatDate } from "@/lib/format";

type Winner = "CONTROL" | "VARIANT" | "INCONCLUSIVE";

function costPerResult(spend: number, conversions: number): number | null {
  return conversions > 0 ? spend / conversions : null;
}

/**
 * Decide o vencedor com dado real, sem inventar significancia estatistica: prioriza
 * custo por resultado (CPL) quando os dois lados tem conversao; sem conversao nos
 * dois lados, compara CTR; sem dado suficiente de nenhum dos dois, fica INCONCLUSIVE.
 */
function decideWinner(
  control: { spend: number; conversions: number; ctr: number },
  variant: { spend: number; conversions: number; ctr: number }
): Winner {
  const controlCpl = costPerResult(control.spend, control.conversions);
  const variantCpl = costPerResult(variant.spend, variant.conversions);

  if (controlCpl !== null && variantCpl !== null) {
    if (Math.abs(controlCpl - variantCpl) < 0.01) return "INCONCLUSIVE";
    return variantCpl < controlCpl ? "VARIANT" : "CONTROL";
  }

  if (control.spend < 5 && variant.spend < 5) return "INCONCLUSIVE";
  if (Math.abs(control.ctr - variant.ctr) < 0.2) return "INCONCLUSIVE";
  return variant.ctr > control.ctr ? "VARIANT" : "CONTROL";
}

async function finalizeAbTest(test: AbTest): Promise<void> {
  const [controlSnapshot, variantSnapshot] = await Promise.all([
    prisma.adMetricSnapshot.findFirst({
      where: { platformAdId: test.controlAdId, collectionState: "OK" },
      orderBy: { collectedAt: "desc" },
    }),
    prisma.adMetricSnapshot.findFirst({
      where: { platformAdId: test.variantAdId, collectionState: "OK" },
      orderBy: { collectedAt: "desc" },
    }),
  ]);

  if (!controlSnapshot || !variantSnapshot) {
    // Sem dado coletado de um dos lados ainda - tenta de novo na proxima rodada em vez
    // de concluir sem informacao real.
    return;
  }

  const control = {
    spend: Number(controlSnapshot.spend),
    conversions: controlSnapshot.conversions,
    ctr: Number(controlSnapshot.ctr),
    cpl: controlSnapshot.cpl !== null ? Number(controlSnapshot.cpl) : null,
  };
  const variant = {
    spend: Number(variantSnapshot.spend),
    conversions: variantSnapshot.conversions,
    ctr: Number(variantSnapshot.ctr),
    cpl: variantSnapshot.cpl !== null ? Number(variantSnapshot.cpl) : null,
  };

  const winner = decideWinner(control, variant);
  const resultSummary = { control, variant, winner };

  await prisma.abTest.update({
    where: { id: test.id },
    data: { status: "COMPLETED", winner, resultSummary, completedAt: new Date() },
  });

  if (winner === "INCONCLUSIVE") {
    return;
  }

  const loserAdId = winner === "VARIANT" ? test.controlAdId : test.variantAdId;
  const winnerLabel = winner === "VARIANT" ? "a variante (verba nova)" : "o controle (verba original)";
  const metricsJson = {
    controlSpend: control.spend,
    controlConversions: control.conversions,
    controlCpl: control.cpl,
    variantSpend: variant.spend,
    variantConversions: variant.conversions,
    variantCpl: variant.cpl,
  };

  const readiness = evaluateProposalReadiness({
    type: "PAUSE_AD",
    platform: test.platform,
    platformCampaignId: null,
    platformAdId: loserAdId,
    metricsJson,
  });

  await prisma.proposal.create({
    data: {
      credentialId: test.credentialId,
      threadId: null,
      createdByUserId: null,
      type: "PAUSE_AD",
      status: deriveInitialStatus(readiness),
      title: `Teste A/B concluído — ${winnerLabel} venceu`,
      reason: `Teste A/B de verba rodou de ${formatDate(test.startedAt)} até ${formatDate(test.endsAt)}. Controle: ${formatCurrency(Number(test.controlValue))}/dia (CPL ${control.cpl ?? "n/d"}). Variante: ${formatCurrency(Number(test.variantValue))}/dia (CPL ${variant.cpl ?? "n/d"}).`,
      metricsJson,
      suggestedAction: `Pausar o anúncio perdedor (${loserAdId}) e manter só ${winnerLabel} rodando.`,
      risk: "Nenhuma ação automática foi tomada - essa é só a recomendação com base no resultado real do teste.",
      rollbackPlan: "Reativar o anúncio pausado se o resultado não se confirmar depois.",
      platform: test.platform,
      platformCampaignId: null,
      platformAdId: loserAdId,
      platformAdSetId: null,
      payloadJson: { source: "ab_test_result", abTestId: test.id, resultSummary },
    },
  });
}

/**
 * Roda pelo mesmo timer da rodada proativa (instrumentation.ts): fecha testes A/B
 * cujo prazo passou, usando dado real ja coletado (AdMetricSnapshot), e cria uma
 * proposta de acao com o resultado - nunca decide/executa nada sozinho.
 */
export async function checkRunningAbTests(): Promise<{ checked: number; completed: number }> {
  const dueTests = await prisma.abTest.findMany({
    where: { status: "RUNNING", endsAt: { lte: new Date() } },
  });

  let completed = 0;
  for (const test of dueTests) {
    await finalizeAbTest(test);
    completed += 1;
  }

  return { checked: dueTests.length, completed };
}
