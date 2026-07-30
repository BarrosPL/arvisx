import type { CollectionState, Platform } from "@/generated/prisma/client";

/** Linha normalizada de anuncio/campanha, comum a Meta e Google, pronta para gravar em AdMetricSnapshot. */
export interface NormalizedAdRow {
  platformCampaignId: string | null;
  campaignName: string | null;
  platformAdId: string | null;
  adName: string | null;
  /** Meta: id do AdSet. Google: id do AdGroup. */
  platformAdSetId: string | null;
  /** Nome do AdSet (Meta) / AdGroup (Google) - nivel intermediario entre campanha e
   * anuncio, historicamente nunca coletado (so o id vinha) - por isso a JAMILE nao
   * conseguia diferenciar/nomear esse nivel em conversa. */
  adSetName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpl: number | null;
  cpa: number | null;
  /** Alcance - null quando a plataforma nao reporta por anuncio (ex: Google Ads). */
  reach: number | null;
  /** Frequencia - null quando a plataforma nao reporta por anuncio (ex: Google Ads). */
  frequency: number | null;
  cpm: number | null;
  /** Status de veiculacao real (ex: ACTIVE/PAUSED, ENABLED/PAUSED/REMOVED). */
  adStatus: string | null;
  raw?: unknown;
}

export interface CollectionResult {
  state: CollectionState;
  rows: NormalizedAdRow[];
  errorMessage?: string;
}

/**
 * Linha normalizada da BIBLIOTECA de criativos - diferente de NormalizedAdRow (metrica
 * de Insights, 7 dias), aqui vem de uma listagem direta dos objetos de anuncio da
 * conta, sem filtro de data - cobre anuncio pausado/antigo tambem, e traz o conteudo
 * do criativo (imagem/texto) em vez de metrica.
 */
export interface NormalizedAdCreativeRow {
  platformAdId: string;
  platformCampaignId: string | null;
  campaignName: string | null;
  adName: string | null;
  /** Meta: id do AdSet. Google: id do AdGroup. Gap real encontrado: nenhuma das duas
   * buscas de biblioteca trazia isso antes - so campanha + anuncio, faltando o nivel
   * de conjunto de anuncios pra montar uma visao hierarquica completa. */
  platformAdSetId: string | null;
  adSetName: string | null;
  status: string | null;
  headline: string | null;
  bodyText: string | null;
  thumbnailUrl: string | null;
  callToAction: string | null;
  raw?: unknown;
}

export interface LibraryCollectionResult {
  state: CollectionState;
  rows: NormalizedAdCreativeRow[];
  errorMessage?: string;
}

/**
 * Linha normalizada no nivel de CAMPANHA. Diferente de NormalizedAdRow (por anuncio),
 * dois campos aqui so sao confiaveis neste nivel:
 * - `reach`: alcance e gente unica, entao somar o alcance dos anuncios de uma campanha
 *   conta a mesma pessoa varias vezes. A plataforma deduplica no servidor quando a
 *   consulta e feita no nivel de campanha - por isso este numero vem daqui, nunca de
 *   soma.
 * - `campaignStatus`: status da propria campanha (antes o sistema so conhecia status de
 *   anuncio, e campanha pausada com anuncio ativo dentro apareceria como ativa).
 */
export interface NormalizedCampaignRow {
  platformCampaignId: string;
  campaignName: string | null;
  campaignStatus: string | null;
  /** Objetivo da campanha - decide qual acao conta como "Resultado" (ver resultMetric.ts). */
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  /** Quantidade de resultados, ja resolvida pelo objetivo da campanha. */
  results: number;
  /** Qual tipo de acao foi contado como resultado (ex: "lead") - pra dar pra auditar. */
  resultType: string | null;
  /** Custo por resultado. */
  cpr: number | null;
  reach: number | null;
  frequency: number | null;
  cpm: number | null;
  raw?: unknown;
}

export interface CampaignCollectionResult {
  state: CollectionState;
  rows: NormalizedCampaignRow[];
  errorMessage?: string;
}

export interface PlatformCredential {
  id: string;
  platform: Platform;
  externalAccountId: string;
  loginCustomerId: string | null;
  accessToken: string;
  refreshToken: string | null;
}
