/**
 * Distribuicao do orcamento diario TOTAL de um produto entre as 5 camadas da esteira
 * (spec-gestor-trafego-ia.md secao 1). Decisao confirmada com o Renan: ele pensa em
 * "quanto quero gastar nesse produto por dia" uma vez so, nao camada por camada.
 */
import type { FunnelLayerKey } from "@/generated/prisma/client";

/**
 * Heuristica de funil de midia, nao um numero cientifico: mais peso em quem ainda nao
 * conhece a marca (FRIO precisa de alcance amplo pra girar), fatia relevante pro 1%
 * (LOOKALIKE existe pra ESCALAR aquisicao, nao pode ficar residual), e menos nas
 * camadas de publico pequeno por natureza (QUENTE/REMARKETING alcancam so quem ja
 * interagiu antes - gastar muito ali não aumenta alcance, so aumenta frequencia).
 * Soma exatamente 1 - validado em teste.
 */
export const FUNNEL_LAYER_BUDGET_SHARE: Record<FunnelLayerKey, number> = {
  FRIO: 0.35,
  MORNO: 0.2,
  QUENTE: 0.15,
  REMARKETING: 0.1,
  LOOKALIKE: 0.2,
};

/**
 * Piso PRATICO por camada, em reais/dia - nao e um minimo oficial da Meta (que varia
 * por moeda/otimizacao e nao e documentado como numero fixo), e uma defesa contra
 * dividir um orcamento pequeno demais em 5 fatias tao finas que a Meta praticamente
 * nao consegue gastar nelas (entrega errática, custo por resultado instavel). Serve
 * pra AVISAR antes de criar 5 campanhas fadadas a nao rodar direito, nao pra travar o
 * usuario - se ele confirmar mesmo assim, o sistema segue.
 */
export const MIN_LAYER_DAILY_BUDGET = 5;

export interface FunnelBudgetLayer {
  layerKey: FunnelLayerKey;
  dailyBudget: number;
}

/** Ordem fixa em que as camadas sao exibidas/criadas em todo o sistema - a mesma order
 * usada aqui, no schema do plano e no executor. */
export const FUNNEL_LAYER_ORDER: FunnelLayerKey[] = ["FRIO", "MORNO", "QUENTE", "REMARKETING", "LOOKALIKE"];

/**
 * Divide o total pelas 5 fatias, arredondando pro centavo - a soma das fatias
 * arredondadas pode diferir do total original por no maximo alguns centavos (efeito
 * de arredondamento independente por camada), o que e aceitavel e mais simples que
 * ajustar uma camada pra absorver a diferenca.
 */
export function distributeFunnelBudget(totalDailyBudget: number): FunnelBudgetLayer[] {
  return FUNNEL_LAYER_ORDER.map((layerKey) => ({
    layerKey,
    dailyBudget: Math.round(totalDailyBudget * FUNNEL_LAYER_BUDGET_SHARE[layerKey] * 100) / 100,
  }));
}

export interface FunnelBudgetValidation {
  ok: boolean;
  /** Camadas que ficariam abaixo do piso pratico com este total - vazio quando ok=true. */
  layersBelowMinimum: FunnelBudgetLayer[];
  /** Quanto precisaria ser o total pra TODA camada bater o piso (baseado na menor
   * fatia, que e sempre REMARKETING com 10%) - sugestao pra devolver ao usuario. */
  suggestedMinimumTotal: number;
}

export function validateFunnelBudget(totalDailyBudget: number): FunnelBudgetValidation {
  const layers = distributeFunnelBudget(totalDailyBudget);
  const layersBelowMinimum = layers.filter((layer) => layer.dailyBudget < MIN_LAYER_DAILY_BUDGET);
  const smallestShare = Math.min(...Object.values(FUNNEL_LAYER_BUDGET_SHARE));

  return {
    ok: layersBelowMinimum.length === 0,
    layersBelowMinimum,
    suggestedMinimumTotal: Math.ceil(MIN_LAYER_DAILY_BUDGET / smallestShare),
  };
}
