import type { PlatformCredential } from "./types";

const GRAPH_API_VERSION = "v21.0";

export interface WriteResult {
  ok: boolean;
  raw?: unknown;
  errorMessage?: string;
}

export type BudgetLevel = "ADSET" | "CAMPAIGN";

export interface BudgetReadResult {
  dailyBudgetMinorUnits: number | null;
  /** Onde a verba realmente mora - CBO (Campaign Budget Optimization) põe a verba na
   * campanha, não no AdSet, e nesse caso o AdSet não tem daily_budget nenhum. */
  level: BudgetLevel | null;
  campaignId: string | null;
  errorMessage?: string;
}

interface MetaApiErrorResponse {
  error?: { message: string; type?: string; code?: number; error_subcode?: number };
}

/**
 * Pausa ou ativa um anuncio (o status mora no proprio anuncio no Meta, diferente da
 * verba que mora no AdSet ou na campanha). Unica funcao do sistema que chama esse
 * endpoint - so lib/execution/executor.ts pode invocar isso, e so depois de aprovacao.
 */
export async function setMetaAdStatus(
  credential: PlatformCredential,
  adId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<WriteResult> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${adId}` +
    `?status=${status}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

async function fetchBudgetFields(
  credential: PlatformCredential,
  id: string,
  extraFields: string
): Promise<{ dailyBudget?: string; lifetimeBudget?: string; extra?: Record<string, unknown>; errorMessage?: string }> {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${id}` +
    `?fields=daily_budget,lifetime_budget${extraFields}&access_token=${encodeURIComponent(credential.accessToken)}`;
  try {
    const response = await fetch(url);
    const body = (await response.json()) as MetaApiErrorResponse & {
      daily_budget?: string;
      lifetime_budget?: string;
      [key: string]: unknown;
    };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${body.error?.message ?? response.statusText}`);
    }
    return { dailyBudget: body.daily_budget, lifetimeBudget: body.lifetime_budget, extra: body };
  } catch (error) {
    return { errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Le a verba diaria real de um anuncio, tentando primeiro o AdSet e, se ele nao tiver
 * orcamento proprio (campanha com Campaign Budget Optimization/CBO - comum, e o caso
 * real testado nesta conta), cai pra verba da campanha-mae. Retorna tambem o nivel e o
 * campaignId, pra escrever no mesmo lugar depois (setMetaBudget).
 */
export async function getMetaBudget(credential: PlatformCredential, adSetId: string): Promise<BudgetReadResult> {
  const adSet = await fetchBudgetFields(credential, adSetId, ",campaign{id}");
  if (adSet.errorMessage) {
    return { dailyBudgetMinorUnits: null, level: null, campaignId: null, errorMessage: adSet.errorMessage };
  }

  const campaignId = (adSet.extra?.campaign as { id?: string } | undefined)?.id ?? null;
  const adSetRaw = adSet.dailyBudget ?? adSet.lifetimeBudget;
  if (adSetRaw !== undefined) {
    return { dailyBudgetMinorUnits: Number(adSetRaw), level: "ADSET", campaignId };
  }

  if (!campaignId) {
    return { dailyBudgetMinorUnits: null, level: null, campaignId: null };
  }

  const campaign = await fetchBudgetFields(credential, campaignId, "");
  if (campaign.errorMessage) {
    return { dailyBudgetMinorUnits: null, level: null, campaignId, errorMessage: campaign.errorMessage };
  }
  const campaignRaw = campaign.dailyBudget ?? campaign.lifetimeBudget;
  if (campaignRaw !== undefined) {
    return { dailyBudgetMinorUnits: Number(campaignRaw), level: "CAMPAIGN", campaignId };
  }

  return { dailyBudgetMinorUnits: null, level: null, campaignId };
}

/** Define a verba diaria nova, em centavos, no MESMO nivel (AdSet ou Campanha) de onde ela foi lida. */
export async function setMetaBudget(
  credential: PlatformCredential,
  target: { level: BudgetLevel; adSetId: string; campaignId: string | null },
  dailyBudgetMinorUnits: number
): Promise<WriteResult> {
  const targetId = target.level === "CAMPAIGN" ? target.campaignId : target.adSetId;
  if (!targetId) {
    return { ok: false, errorMessage: "Nao foi possivel determinar onde a verba mora (AdSet ou Campanha)" };
  }

  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${targetId}` +
    `?daily_budget=${Math.round(dailyBudgetMinorUnits)}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as MetaApiErrorResponse & { success?: boolean };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${body.error?.message ?? response.statusText}`);
    }
    return { ok: true, raw: body };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export interface MetaAdDetails {
  creativeId: string | null;
  adSetId: string | null;
  adSetName: string | null;
  campaignId: string | null;
  targeting: unknown;
  billingEvent: string | null;
  optimizationGoal: string | null;
  bidStrategy: string | null;
  errorMessage?: string;
}

/** Le tudo que precisa copiar pra duplicar um anuncio (usado no teste A/B - ver duplicateMetaAdWithBudget). */
export async function getMetaAdDetails(credential: PlatformCredential, adId: string): Promise<MetaAdDetails> {
  const fields =
    "creative{id},adset{id,name,targeting,billing_event,optimization_goal,bid_strategy,campaign_id}";
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${adId}` +
    `?fields=${fields}&access_token=${encodeURIComponent(credential.accessToken)}`;

  try {
    const response = await fetch(url);
    const body = (await response.json()) as MetaApiErrorResponse & {
      creative?: { id?: string };
      adset?: {
        id?: string;
        name?: string;
        targeting?: unknown;
        billing_event?: string;
        optimization_goal?: string;
        bid_strategy?: string;
        campaign_id?: string;
      };
    };
    if (!response.ok || body.error) {
      throw new Error(`Meta API error: ${body.error?.message ?? response.statusText}`);
    }
    return {
      creativeId: body.creative?.id ?? null,
      adSetId: body.adset?.id ?? null,
      adSetName: body.adset?.name ?? null,
      campaignId: body.adset?.campaign_id ?? null,
      targeting: body.adset?.targeting ?? null,
      billingEvent: body.adset?.billing_event ?? null,
      optimizationGoal: body.adset?.optimization_goal ?? null,
      bidStrategy: body.adset?.bid_strategy ?? null,
    };
  } catch (error) {
    return {
      creativeId: null,
      adSetId: null,
      adSetName: null,
      campaignId: null,
      targeting: null,
      billingEvent: null,
      optimizationGoal: null,
      bidStrategy: null,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export interface DuplicateAdResult {
  ok: boolean;
  newAdSetId?: string;
  newAdId?: string;
  raw?: unknown;
  errorMessage?: string;
}

function toAccountId(externalAccountId: string): string {
  return externalAccountId.startsWith("act_") ? externalAccountId : `act_${externalAccountId}`;
}

/**
 * Duplica um anuncio real com verba diferente, pra rodar um teste A/B de verdade:
 * cria um AdSet novo (mesma segmentacao/otimizacao do original, verba testada) e um
 * Ad novo reaproveitando o creative_id original (sem reenviar imagem/texto). E uma
 * escrita real na conta - so chamado por lib/execution/executor.ts, depois de
 * aprovacao humana.
 */
export async function duplicateMetaAdWithBudget(
  credential: PlatformCredential,
  params: { adId: string; newDailyBudgetMinorUnits: number; endsAt: Date }
): Promise<DuplicateAdResult> {
  const details = await getMetaAdDetails(credential, params.adId);
  if (details.errorMessage || !details.adSetId || !details.creativeId || !details.campaignId) {
    return {
      ok: false,
      errorMessage: details.errorMessage ?? "Não foi possível ler os dados completos do anúncio original",
    };
  }

  const accountId = toAccountId(credential.externalAccountId);

  try {
    const adSetBody: Record<string, unknown> = {
      name: `${details.adSetName ?? "AdSet"} — Teste A/B verba`,
      campaign_id: details.campaignId,
      daily_budget: Math.round(params.newDailyBudgetMinorUnits),
      targeting: details.targeting,
      status: "ACTIVE",
      end_time: Math.floor(params.endsAt.getTime() / 1000),
    };
    if (details.billingEvent) adSetBody.billing_event = details.billingEvent;
    if (details.optimizationGoal) adSetBody.optimization_goal = details.optimizationGoal;
    if (details.bidStrategy) adSetBody.bid_strategy = details.bidStrategy;

    const adSetResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/adsets?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adSetBody) }
    );
    const adSetResult = (await adSetResponse.json()) as MetaApiErrorResponse & { id?: string };
    if (!adSetResponse.ok || adSetResult.error || !adSetResult.id) {
      throw new Error(`Meta API error (criar AdSet): ${adSetResult.error?.message ?? adSetResponse.statusText}`);
    }
    const newAdSetId = adSetResult.id;

    const adBody = {
      name: `Teste A/B — verba`,
      adset_id: newAdSetId,
      creative: { creative_id: details.creativeId },
      status: "ACTIVE",
    };
    const adResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/ads?access_token=${encodeURIComponent(credential.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adBody) }
    );
    const adResult = (await adResponse.json()) as MetaApiErrorResponse & { id?: string };
    if (!adResponse.ok || adResult.error || !adResult.id) {
      throw new Error(`Meta API error (criar Ad): ${adResult.error?.message ?? adResponse.statusText}`);
    }

    return { ok: true, newAdSetId, newAdId: adResult.id, raw: { adSetResult, adResult } };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
