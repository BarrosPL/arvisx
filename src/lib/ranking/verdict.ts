import type { RankableRow, RankingBuckets } from "./types";

export type Verdict = "BOM" | "MEDIO" | "RUIM";

export type RecommendedProposalType =
  | "NEW_CAMPAIGN"
  | "PAUSE_AD"
  | "ACTIVATE_AD"
  | "ADJUST_BUDGET"
  | "CREATE_AD_VARIATION"
  | "CREATE_AB_TEST"
  | "OTHER";

export interface RecommendedAction {
  verdict: Verdict;
  reason: string;
  suggestedAction: string;
  risk: string;
  rollback: string;
  row: RankableRow;
  /** Que tipo de Proposal essa recomendacao vira - usado pela rodada proativa do scheduler
   * pra criar a proposta sem precisar chamar o modelo (lib/scheduler/proactiveRound.ts). */
  proposalType: RecommendedProposalType;
}

export interface RankingVerdict {
  verdict: Verdict;
  recommendedActions: RecommendedAction[];
}

const MAX_ACTIONS = 3;

const ROLLBACK_DEFAULT = "Reverter para o status/verba anterior se a métrica piorar em 48h.";

const GROUPS: {
  verdict: Verdict;
  reason: string;
  suggestedAction: string;
  risk: string;
  proposalType: RecommendedProposalType;
  pick: (buckets: RankingBuckets) => RankableRow[];
}[] = [
  {
    verdict: "RUIM",
    reason: "gasto sem conversão",
    suggestedAction: "pausar ou reduzir verba somente após aprovação, e preparar novo criativo",
    risk: "continuar queimando verba sem gerar lead/venda",
    proposalType: "PAUSE_AD",
    pick: (buckets) => buckets.spendNoConversion,
  },
  {
    verdict: "RUIM",
    reason: "CTR baixo",
    suggestedAction: "trocar gancho/criativo em teste controlado",
    risk: "audiência já saturada com o criativo atual, desperdiçando impressão",
    proposalType: "CREATE_AD_VARIATION",
    pick: (buckets) => buckets.lowCtr,
  },
  {
    verdict: "RUIM",
    reason: "CPL/CPA alto",
    suggestedAction: "revisar oferta, público e página antes de ampliar verba",
    risk: "escalar um custo por resultado que não é sustentável",
    proposalType: "ADJUST_BUDGET",
    pick: (buckets) => buckets.highCpl,
  },
  {
    verdict: "BOM",
    reason: "candidato a escala",
    suggestedAction: "testar aumento gradual de verba com limite e rollback definidos",
    risk: "escalar rápido demais e quebrar a estabilidade do CPL",
    proposalType: "ADJUST_BUDGET",
    pick: (buckets) => buckets.scaleCandidates,
  },
  {
    verdict: "MEDIO",
    reason: "sinal de fadiga de criativo",
    suggestedAction: "produzir variação de criativo mantendo o restante da campanha estável",
    risk: "CTR continuar caindo e o CPL subir nas próximas semanas",
    proposalType: "CREATE_AD_VARIATION",
    pick: (buckets) => buckets.needsNewCreative,
  },
];

function rowKey(row: RankableRow): string {
  return row.platformAdId ?? row.platformCampaignId ?? `${row.platform}:${row.campaignName ?? ""}`;
}

/** Prioriza os baldes de classificação em um veredito executivo e até 3 ações, replicando a leitura da JAMILE. */
export function buildVerdict(buckets: RankingBuckets): RankingVerdict {
  const seen = new Set<string>();
  const recommendedActions: RecommendedAction[] = [];

  for (const group of GROUPS) {
    for (const row of group.pick(buckets)) {
      if (recommendedActions.length >= MAX_ACTIONS) break;
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      recommendedActions.push({
        verdict: group.verdict,
        reason: group.reason,
        suggestedAction: group.suggestedAction,
        risk: group.risk,
        rollback: ROLLBACK_DEFAULT,
        proposalType: group.proposalType,
        row,
      });
    }
    if (recommendedActions.length >= MAX_ACTIONS) break;
  }

  let verdict: Verdict = "MEDIO";
  if (recommendedActions.some((action) => action.verdict === "RUIM")) {
    verdict = "RUIM";
  } else if (recommendedActions.some((action) => action.verdict === "BOM")) {
    verdict = "BOM";
  }

  return { verdict, recommendedActions };
}
