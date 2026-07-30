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

export interface PlatformCredential {
  id: string;
  platform: Platform;
  externalAccountId: string;
  loginCustomerId: string | null;
  accessToken: string;
  refreshToken: string | null;
}
