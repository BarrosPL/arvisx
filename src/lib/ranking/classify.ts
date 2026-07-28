import type { RankableRow, RankingBuckets } from "./types";

const MIN_SPEND_TO_FLAG = 5;
const MIN_IMPRESSIONS_TO_JUDGE_CTR = 500;
const LOW_CTR_THRESHOLD = 1.2;
const HIGH_CPL_THRESHOLD = 20;
const SCALE_CTR_THRESHOLD = 1.5;
const SCALE_CPL_MAX = 10;
const CREATIVE_FATIGUE_IMPRESSIONS = 1000;
const CREATIVE_FATIGUE_CTR_THRESHOLD = 0.8;

function costPerResult(row: RankableRow): number | null {
  return row.cpl ?? row.cpa;
}

/** Classifica linhas de metricas normalizadas (Meta/Google) em baldes acionaveis, replicando a leitura de gestora do prompt original da JAMILE. */
export function classifyRows(rows: RankableRow[]): RankingBuckets {
  const spendNoConversion = rows
    .filter((row) => row.spend > MIN_SPEND_TO_FLAG && row.conversions === 0)
    .sort((a, b) => b.spend - a.spend);

  const lowCtr = rows
    .filter((row) => row.impressions > MIN_IMPRESSIONS_TO_JUDGE_CTR && row.ctr < LOW_CTR_THRESHOLD)
    .sort((a, b) => a.ctr - b.ctr);

  const highCpl = rows
    .filter((row) => row.conversions > 0 && (costPerResult(row) ?? 0) > HIGH_CPL_THRESHOLD)
    .sort((a, b) => (costPerResult(b) ?? 0) - (costPerResult(a) ?? 0));

  const scaleCandidates = rows
    .filter((row) => {
      const cost = costPerResult(row);
      return (
        row.conversions > 0 &&
        row.ctr >= SCALE_CTR_THRESHOLD &&
        cost !== null &&
        cost > 0 &&
        cost <= SCALE_CPL_MAX
      );
    })
    .sort((a, b) => b.conversions - a.conversions);

  const needsNewCreative = rows
    .filter(
      (row) => row.impressions > CREATIVE_FATIGUE_IMPRESSIONS && row.ctr < CREATIVE_FATIGUE_CTR_THRESHOLD
    )
    .sort((a, b) => b.spend - a.spend);

  return { spendNoConversion, lowCtr, highCpl, scaleCandidates, needsNewCreative };
}
