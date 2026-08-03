import { prisma } from "@/lib/prisma";
import {
  ExecutionStatus,
  type ExecutionAction,
  type Proposal,
  type ProposalFunnelLayer,
  type FunnelLayerKey,
} from "@/generated/prisma/client";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";
import { toPlatformCredential } from "@/lib/ads/credentials";
import type { CampaignPlan, FunnelPlan } from "@/lib/agent/schema";
import type { MetaAdSetTargeting } from "@/lib/ads/metaWrite";
import {
  setMetaAdStatus,
  setMetaAdSetStatus,
  setMetaCampaignStatus,
  setMetaBudget,
  getMetaBudget,
  duplicateMetaAdWithBudget,
  uploadMetaAdImage,
  uploadMetaAdVideo,
  resolveMetaPageId,
  searchMetaInterests,
  createMetaCampaign,
  createMetaAdSet,
  createMetaAdCreative,
  createMetaVideoAdCreative,
  createMetaAd,
} from "@/lib/ads/metaWrite";
import { createMetaEngagementAudience, createMetaLookalikeAudience, PAGE_ENGAGEMENT_EVENTS } from "@/lib/ads/metaAudiences";
import { storePublicImage } from "@/lib/media/publicAssets";
import {
  setGoogleAdStatus,
  setGoogleAdGroupStatus,
  setGoogleCampaignStatus,
  setGoogleCampaignBudget,
  getGoogleCampaignBudget,
  createGoogleCampaignBudget,
  createGoogleCampaign,
  createGoogleAdGroup,
  createGoogleKeywords,
  createGoogleResponsiveSearchAd,
} from "@/lib/ads/googleWrite";

const AB_TEST_DURATION_DAYS = 7;

interface AbTestSetup {
  controlAdId: string;
  controlAdSetId: string;
  variantAdId: string;
  variantAdSetId: string;
  controlValue: number;
  variantValue: number;
  endsAt: Date;
}

interface CreatedIds {
  platformCampaignId?: string;
  platformAdSetId?: string;
  platformAdId?: string;
}

interface DispatchResult {
  ok: boolean;
  requestJson: unknown;
  responseJson?: unknown;
  errorMessage?: string;
  rollbackInfoJson?: unknown;
  abTestSetup?: AbTestSetup;
  /** So preenchido por NEW_CAMPAIGN - a proposta nao tinha IDs reais antes de executar. */
  createdIds?: CreatedIds;
}

async function findCredential(credentialId: string, platform: "META" | "GOOGLE") {
  const record = await prisma.adCredential.findFirst({
    where: { id: credentialId, platform },
    include: { providerConnection: true },
  });
  if (!record) {
    throw new Error(`A conta de anuncio desta proposta nao e ${platform}`);
  }
  return toPlatformCredential(record);
}

type MetaCredential = Awaited<ReturnType<typeof findCredential>>;

interface FunnelLayerResult {
  ok: boolean;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  errorMessage?: string;
}

/**
 * Cria UMA camada da esteira (campanha + adset + criativo + anuncio) - mesma cadeia
 * que o bloco NEW_CAMPAIGN/META usa, parametrizada por camada em vez de repetida 5
 * vezes. Reaproveita o mesmo branch imagem-OU-video (video_data nao tem campo de texto
 * principal, confirmado na doc oficial - ver NEW_CAMPAIGN acima pro motivo).
 */
async function createMetaFunnelLayerAd(
  credential: MetaCredential,
  params: {
    pageId: string;
    campaignName: string;
    dailyBudgetMinorUnits: number;
    headline: string;
    primaryText: string;
    description: string;
    callToAction: string;
    finalUrl: string;
    targeting: MetaAdSetTargeting;
    layer: ProposalFunnelLayer;
  }
): Promise<FunnelLayerResult> {
  const hasImage = !!params.layer.creativeAssetData;
  const hasVideo = !!params.layer.creativeVideoData && !!params.layer.creativeCoverImageData;
  if (!hasImage && !hasVideo) {
    return { ok: false, errorMessage: "Camada sem imagem ou vídeo anexado" };
  }

  let creativeSource: { kind: "image"; imageHash: string } | { kind: "video"; videoId: string; thumbnailUrl: string };

  if (hasVideo) {
    const videoBase64 = Buffer.from(params.layer.creativeVideoData!).toString("base64");
    const videoUploadResult = await uploadMetaAdVideo(credential, {
      base64Data: videoBase64,
      mimeType: params.layer.creativeVideoMimeType ?? "video/mp4",
      title: params.campaignName,
    });
    if (!videoUploadResult.ok || !videoUploadResult.videoId) {
      return { ok: false, errorMessage: videoUploadResult.errorMessage ?? "Falha ao subir o vídeo do anúncio" };
    }
    const { publicUrl: thumbnailUrl } = await storePublicImage(
      Buffer.from(params.layer.creativeCoverImageData!),
      params.layer.creativeCoverImageMimeType ?? "image/jpeg"
    );
    creativeSource = { kind: "video", videoId: videoUploadResult.videoId, thumbnailUrl };
  } else {
    const imageBase64 = Buffer.from(params.layer.creativeAssetData!).toString("base64");
    const uploadResult = await uploadMetaAdImage(credential, imageBase64);
    if (!uploadResult.ok || !uploadResult.imageHash) {
      return { ok: false, errorMessage: uploadResult.errorMessage ?? "Falha ao subir a imagem do anúncio" };
    }
    creativeSource = { kind: "image", imageHash: uploadResult.imageHash };
  }

  // Cada camada nasce pausada, mesma regra fixa do NEW_CAMPAIGN - confere no
  // Gerenciador antes de ativar manualmente por la.
  const campaignResult = await createMetaCampaign(credential, {
    name: params.campaignName,
    dailyBudgetMinorUnits: params.dailyBudgetMinorUnits,
    status: "PAUSED",
  });
  if (!campaignResult.ok || !campaignResult.campaignId) {
    return { ok: false, errorMessage: campaignResult.errorMessage ?? "Falha ao criar a campanha" };
  }

  const adSetResult = await createMetaAdSet(credential, {
    campaignId: campaignResult.campaignId,
    name: `${params.campaignName} — AdSet`,
    targeting: params.targeting,
    status: "PAUSED",
  });
  if (!adSetResult.ok || !adSetResult.adSetId) {
    return {
      ok: false,
      campaignId: campaignResult.campaignId,
      errorMessage: adSetResult.errorMessage ?? "Falha ao criar o AdSet",
    };
  }

  const creativeResult =
    creativeSource.kind === "video"
      ? await createMetaVideoAdCreative(credential, {
          pageId: params.pageId,
          videoId: creativeSource.videoId,
          thumbnailImageUrl: creativeSource.thumbnailUrl,
          linkDescription: params.description,
          callToAction: params.callToAction,
          linkUrl: params.finalUrl,
          name: params.headline,
        })
      : await createMetaAdCreative(credential, {
          pageId: params.pageId,
          imageHash: creativeSource.imageHash,
          headline: params.headline,
          primaryText: params.primaryText,
          description: params.description,
          callToAction: params.callToAction,
          linkUrl: params.finalUrl,
        });
  if (!creativeResult.ok || !creativeResult.creativeId) {
    return {
      ok: false,
      campaignId: campaignResult.campaignId,
      adSetId: adSetResult.adSetId,
      errorMessage: creativeResult.errorMessage ?? "Falha ao criar o criativo",
    };
  }

  const adResult = await createMetaAd(credential, {
    adSetId: adSetResult.adSetId,
    creativeId: creativeResult.creativeId,
    name: params.campaignName,
    status: "PAUSED",
  });
  if (!adResult.ok || !adResult.adId) {
    return {
      ok: false,
      campaignId: campaignResult.campaignId,
      adSetId: adSetResult.adSetId,
      errorMessage: adResult.errorMessage ?? "Falha ao criar o anúncio",
    };
  }

  return { ok: true, campaignId: campaignResult.campaignId, adSetId: adSetResult.adSetId, adId: adResult.adId };
}

/** Despacha a chamada real de escrita conforme o tipo da proposta. Nunca chamado sem status aprovado (ver executeProposal). */
async function dispatchExecution(proposal: Proposal): Promise<DispatchResult> {
  if (!proposal.platform) {
    throw new Error("Proposta sem plataforma definida");
  }
  const credential = await findCredential(proposal.credentialId, proposal.platform);

  if (proposal.type === "PAUSE_AD" || proposal.type === "ACTIVATE_AD") {
    const wantActive = proposal.type === "ACTIVATE_AD";

    // 3 niveis possiveis, do mais especifico pro mais amplo - qual id a proposta tem
    // preenchido decide o que executa: platformAdId = so aquele anuncio; sem adId mas
    // com platformAdSetId = o CONJUNTO de anuncios inteiro; sem os dois, so
    // platformCampaignId = a CAMPANHA inteira. dataEnforcement.ts so exige
    // campaignId OU adId real pra sair de "precisa de mais dados" - pausar um
    // conjunto sempre vem com campaignId tambem preenchido (a JAMILE ja tem os dois
    // de qualquer consulta a get_ad_sets/get_metrics), por isso adSetId e checado
    // ANTES de campaignId aqui, senao um pedido de conjunto cairia no nivel de
    // campanha por engano.
    if (proposal.platformAdId) {
      if (proposal.platform === "META") {
        const result = await setMetaAdStatus(credential, proposal.platformAdId, wantActive ? "ACTIVE" : "PAUSED");
        return {
          ok: result.ok,
          requestJson: { adId: proposal.platformAdId, status: wantActive ? "ACTIVE" : "PAUSED" },
          responseJson: result.raw,
          errorMessage: result.errorMessage,
          rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", adId: proposal.platformAdId },
        };
      }

      if (!proposal.platformAdSetId) {
        throw new Error("Proposta sem platformAdSetId (adGroupId necessario para o Google Ads)");
      }
      const result = await setGoogleAdStatus(
        credential,
        proposal.platformAdSetId,
        proposal.platformAdId,
        wantActive ? "ENABLED" : "PAUSED"
      );
      return {
        ok: result.ok,
        requestJson: { adGroupId: proposal.platformAdSetId, adId: proposal.platformAdId, status: wantActive ? "ENABLED" : "PAUSED" },
        responseJson: result.raw,
        errorMessage: result.errorMessage,
        rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", adGroupId: proposal.platformAdSetId, adId: proposal.platformAdId },
      };
    }

    if (proposal.platformAdSetId) {
      if (proposal.platform === "META") {
        const result = await setMetaAdSetStatus(credential, proposal.platformAdSetId, wantActive ? "ACTIVE" : "PAUSED");
        return {
          ok: result.ok,
          requestJson: { adSetId: proposal.platformAdSetId, status: wantActive ? "ACTIVE" : "PAUSED" },
          responseJson: result.raw,
          errorMessage: result.errorMessage,
          rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", adSetId: proposal.platformAdSetId },
        };
      }

      const result = await setGoogleAdGroupStatus(credential, proposal.platformAdSetId, wantActive ? "ENABLED" : "PAUSED");
      return {
        ok: result.ok,
        requestJson: { adGroupId: proposal.platformAdSetId, status: wantActive ? "ENABLED" : "PAUSED" },
        responseJson: result.raw,
        errorMessage: result.errorMessage,
        rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", adGroupId: proposal.platformAdSetId },
      };
    }

    if (!proposal.platformCampaignId) {
      throw new Error("Proposta sem platformAdId, platformAdSetId nem platformCampaignId");
    }

    if (proposal.platform === "META") {
      const result = await setMetaCampaignStatus(credential, proposal.platformCampaignId, wantActive ? "ACTIVE" : "PAUSED");
      return {
        ok: result.ok,
        requestJson: { campaignId: proposal.platformCampaignId, status: wantActive ? "ACTIVE" : "PAUSED" },
        responseJson: result.raw,
        errorMessage: result.errorMessage,
        rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", campaignId: proposal.platformCampaignId },
      };
    }

    const result = await setGoogleCampaignStatus(credential, proposal.platformCampaignId, wantActive ? "ENABLED" : "PAUSED");
    return {
      ok: result.ok,
      requestJson: { campaignId: proposal.platformCampaignId, status: wantActive ? "ENABLED" : "PAUSED" },
      responseJson: result.raw,
      errorMessage: result.errorMessage,
      rollbackInfoJson: { action: wantActive ? "PAUSE_AD" : "ACTIVATE_AD", campaignId: proposal.platformCampaignId },
    };
  }

  if (proposal.type === "ADJUST_BUDGET") {
    const metrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
    const proposedBudget = Number(metrics.proposedBudget);
    if (!Number.isFinite(proposedBudget) || proposedBudget <= 0) {
      throw new Error("Proposta sem proposedBudget valido em metricsJson");
    }

    if (proposal.platform === "META") {
      if (!proposal.platformAdSetId) {
        throw new Error("Proposta sem platformAdSetId (Meta)");
      }
      const before = await getMetaBudget(credential, proposal.platformAdSetId);
      if (before.errorMessage || !before.level) {
        throw new Error(before.errorMessage ?? "Não foi possível localizar onde a verba mora (AdSet ou campanha/CBO)");
      }
      const dailyBudgetMinorUnits = Math.round(proposedBudget * 100);
      const result = await setMetaBudget(
        credential,
        { level: before.level, adSetId: proposal.platformAdSetId, campaignId: before.campaignId },
        dailyBudgetMinorUnits
      );
      return {
        ok: result.ok,
        requestJson: { level: before.level, adSetId: proposal.platformAdSetId, campaignId: before.campaignId, dailyBudgetMinorUnits },
        responseJson: result.raw,
        errorMessage: result.errorMessage,
        rollbackInfoJson: {
          previousDailyBudget: before.dailyBudgetMinorUnits !== null ? before.dailyBudgetMinorUnits / 100 : null,
          level: before.level,
        },
      };
    }

    if (!proposal.platformCampaignId) {
      throw new Error("Proposta sem platformCampaignId (Google)");
    }
    const before = await getGoogleCampaignBudget(credential, proposal.platformCampaignId);
    if (!before.resourceName) {
      throw new Error("Nao foi possivel localizar o recurso de orcamento da campanha no Google Ads");
    }
    const amountMicros = Math.round(proposedBudget * 1_000_000);
    const result = await setGoogleCampaignBudget(credential, before.resourceName, amountMicros);
    return {
      ok: result.ok,
      requestJson: { budgetResourceName: before.resourceName, amountMicros },
      responseJson: result.raw,
      errorMessage: result.errorMessage,
      rollbackInfoJson: { previousAmountMicros: before.amountMicros },
    };
  }

  if (proposal.type === "CREATE_AB_TEST") {
    if (proposal.platform !== "META") {
      throw new Error("Teste A/B com execução real ainda só é suportado no Meta Ads nesta versão");
    }
    if (!proposal.platformAdId) {
      throw new Error("Proposta sem platformAdId (anúncio original a duplicar)");
    }
    if (!proposal.platformAdSetId) {
      throw new Error("Proposta sem platformAdSetId (AdSet do anúncio original)");
    }

    const metrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
    const currentBudget = Number(metrics.currentBudget);
    const proposedBudget = Number(metrics.proposedBudget);
    if (!Number.isFinite(currentBudget) || !Number.isFinite(proposedBudget) || proposedBudget <= 0) {
      throw new Error("Proposta sem currentBudget/proposedBudget válidos em metricsJson");
    }

    const endsAt = new Date(Date.now() + AB_TEST_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const result = await duplicateMetaAdWithBudget(credential, {
      adId: proposal.platformAdId,
      newDailyBudgetMinorUnits: Math.round(proposedBudget * 100),
      endsAt,
    });

    if (!result.ok || !result.newAdId || !result.newAdSetId) {
      return {
        ok: false,
        requestJson: { adId: proposal.platformAdId, proposedBudget },
        errorMessage: result.errorMessage ?? "Falha ao duplicar anúncio para o teste A/B",
      };
    }

    return {
      ok: true,
      requestJson: { adId: proposal.platformAdId, proposedBudget, endsAt },
      responseJson: result.raw,
      abTestSetup: {
        controlAdId: proposal.platformAdId,
        controlAdSetId: proposal.platformAdSetId,
        variantAdId: result.newAdId,
        variantAdSetId: result.newAdSetId,
        controlValue: currentBudget,
        variantValue: proposedBudget,
        endsAt,
      },
    };
  }

  if (proposal.type === "NEW_CAMPAIGN") {
    const payload = proposal.payloadJson as { campaignPlan?: CampaignPlan } | null;
    const plan = payload?.campaignPlan;
    if (!plan) {
      throw new Error("Proposta sem campaignPlan em payloadJson");
    }

    if (proposal.platform === "META") {
      if (!plan.metaTargeting) {
        throw new Error("campaignPlan sem metaTargeting (Meta)");
      }
      const hasImage = !!proposal.creativeAssetData;
      const hasVideo = !!proposal.creativeVideoData && !!proposal.creativeCoverImageData;
      if (!hasImage && !hasVideo) {
        throw new Error("Proposta sem imagem ou vídeo do anúncio anexado");
      }

      // Duas fontes possiveis de criativo (imagem OU video+capa - nunca as duas na
      // mesma proposta, ver comentario no schema.prisma). Resolvidas aqui, ANTES de
      // criar campanha/adset na Meta - falha rapido e barato em vez de deixar recurso
      // real pela metade se o upload do criativo falhar.
      let creativeSource:
        | { kind: "image"; imageHash: string }
        | { kind: "video"; videoId: string; thumbnailUrl: string };

      if (hasVideo) {
        const videoBase64 = Buffer.from(proposal.creativeVideoData!).toString("base64");
        const videoUploadResult = await uploadMetaAdVideo(credential, {
          base64Data: videoBase64,
          mimeType: proposal.creativeVideoMimeType ?? "video/mp4",
          title: plan.campaignName,
        });
        if (!videoUploadResult.ok || !videoUploadResult.videoId) {
          return {
            ok: false,
            requestJson: { campaignName: plan.campaignName },
            errorMessage: videoUploadResult.errorMessage ?? "Falha ao subir o vídeo do anúncio",
          };
        }

        const { publicUrl: thumbnailUrl } = await storePublicImage(
          Buffer.from(proposal.creativeCoverImageData!),
          proposal.creativeCoverImageMimeType ?? "image/jpeg"
        );

        creativeSource = { kind: "video", videoId: videoUploadResult.videoId, thumbnailUrl };
      } else {
        const imageBase64 = Buffer.from(proposal.creativeAssetData!).toString("base64");
        const uploadResult = await uploadMetaAdImage(credential, imageBase64);
        if (!uploadResult.ok || !uploadResult.imageHash) {
          return {
            ok: false,
            requestJson: { campaignName: plan.campaignName },
            errorMessage: uploadResult.errorMessage ?? "Falha ao subir a imagem do anúncio",
          };
        }
        creativeSource = { kind: "image", imageHash: uploadResult.imageHash };
      }

      const pageResult = await resolveMetaPageId(credential);
      if (!pageResult.ok || !pageResult.pageId) {
        return {
          ok: false,
          requestJson: { campaignName: plan.campaignName },
          errorMessage: pageResult.errorMessage ?? "Falha ao resolver a Página do Facebook da conta",
        };
      }

      const interestIds: string[] = [];
      for (const interest of plan.metaTargeting.interests) {
        const matches = await searchMetaInterests(credential, interest);
        if (matches.length === 0) {
          return {
            ok: false,
            requestJson: { campaignName: plan.campaignName },
            errorMessage: `Não foi possível resolver o interesse "${interest}" no Meta`,
          };
        }
        interestIds.push(matches[0].id);
      }

      // NEW_CAMPAIGN sempre nasce pausada, independente de quem disparou a execucao -
      // regra fixa (decidida com o Renan) pra ele conferir a campanha real no Gerenciador
      // de Anuncios antes de ativar manualmente por la.
      const campaignResult = await createMetaCampaign(credential, {
        name: plan.campaignName,
        dailyBudgetMinorUnits: Math.round(plan.dailyBudget * 100),
        status: "PAUSED",
      });
      if (!campaignResult.ok || !campaignResult.campaignId) {
        return {
          ok: false,
          requestJson: { campaignName: plan.campaignName },
          errorMessage: campaignResult.errorMessage ?? "Falha ao criar a campanha",
        };
      }

      const adSetResult = await createMetaAdSet(credential, {
        campaignId: campaignResult.campaignId,
        name: `${plan.campaignName} — AdSet`,
        targeting: {
          countries: plan.metaTargeting.countries,
          ageMin: plan.metaTargeting.ageMin,
          ageMax: plan.metaTargeting.ageMax,
          interestIds,
        },
        status: "PAUSED",
      });
      if (!adSetResult.ok || !adSetResult.adSetId) {
        return {
          ok: false,
          requestJson: { campaignId: campaignResult.campaignId },
          errorMessage: adSetResult.errorMessage ?? "Falha ao criar o AdSet",
          rollbackInfoJson: { platform: "META", campaignId: campaignResult.campaignId, note: "Campanha criada sem AdSet - pausar/apagar manualmente." },
        };
      }

      // video_data (ver createMetaVideoAdCreative) nao tem campo pra texto principal -
      // so link_data (caminho de imagem) tem "message"/primaryText. Confirmado na doc
      // oficial, nao e omissao: nao ha onde colocar plan.primaryText no anuncio em video.
      const creativeResult =
        creativeSource.kind === "video"
          ? await createMetaVideoAdCreative(credential, {
              pageId: pageResult.pageId,
              videoId: creativeSource.videoId,
              thumbnailImageUrl: creativeSource.thumbnailUrl,
              linkDescription: plan.description,
              callToAction: plan.callToAction,
              linkUrl: plan.finalUrl,
              name: plan.headline,
            })
          : await createMetaAdCreative(credential, {
              pageId: pageResult.pageId,
              imageHash: creativeSource.imageHash,
              headline: plan.headline,
              primaryText: plan.primaryText,
              description: plan.description,
              callToAction: plan.callToAction,
              linkUrl: plan.finalUrl,
            });
      if (!creativeResult.ok || !creativeResult.creativeId) {
        return {
          ok: false,
          requestJson: { adSetId: adSetResult.adSetId },
          errorMessage: creativeResult.errorMessage ?? "Falha ao criar o criativo",
          rollbackInfoJson: { platform: "META", campaignId: campaignResult.campaignId, note: "Campanha/AdSet criados sem anúncio - pausar/apagar manualmente." },
        };
      }

      const adResult = await createMetaAd(credential, {
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        name: plan.campaignName,
        status: "PAUSED",
      });
      if (!adResult.ok || !adResult.adId) {
        return {
          ok: false,
          requestJson: { creativeId: creativeResult.creativeId },
          errorMessage: adResult.errorMessage ?? "Falha ao criar o anúncio",
          rollbackInfoJson: { platform: "META", campaignId: campaignResult.campaignId, note: "Campanha/AdSet criados sem anúncio - pausar/apagar manualmente." },
        };
      }

      return {
        ok: true,
        requestJson: { campaignName: plan.campaignName, dailyBudget: plan.dailyBudget },
        responseJson: {
          campaignId: campaignResult.campaignId,
          adSetId: adSetResult.adSetId,
          creativeId: creativeResult.creativeId,
          adId: adResult.adId,
        },
        createdIds: {
          platformCampaignId: campaignResult.campaignId,
          platformAdSetId: adSetResult.adSetId,
          platformAdId: adResult.adId,
        },
        rollbackInfoJson: {
          platform: "META",
          campaignId: campaignResult.campaignId,
          note: "Pausar a campanha manualmente no Gerenciador de Anúncios pra reverter.",
        },
      };
    }

    // GOOGLE
    if (!plan.googleKeywords || !plan.googleAd) {
      throw new Error("campaignPlan sem googleKeywords/googleAd (Google)");
    }

    const budgetResult = await createGoogleCampaignBudget(credential, {
      name: `${plan.campaignName} — Orçamento`,
      dailyBudgetMicros: Math.round(plan.dailyBudget * 1_000_000),
    });
    if (!budgetResult.ok || !budgetResult.resourceName) {
      return {
        ok: false,
        requestJson: { campaignName: plan.campaignName },
        errorMessage: budgetResult.errorMessage ?? "Falha ao criar o orçamento da campanha",
      };
    }

    // NEW_CAMPAIGN sempre nasce pausada, mesmo motivo do bloco Meta acima.
    const campaignResult = await createGoogleCampaign(credential, {
      name: plan.campaignName,
      budgetResourceName: budgetResult.resourceName,
      status: "PAUSED",
    });
    if (!campaignResult.ok || !campaignResult.resourceName || !campaignResult.campaignId) {
      return {
        ok: false,
        requestJson: { campaignName: plan.campaignName },
        errorMessage: campaignResult.errorMessage ?? "Falha ao criar a campanha",
      };
    }

    const adGroupResult = await createGoogleAdGroup(credential, {
      campaignResourceName: campaignResult.resourceName,
      name: `${plan.campaignName} — Grupo de anúncios`,
      status: "PAUSED",
    });
    if (!adGroupResult.ok || !adGroupResult.resourceName || !adGroupResult.adGroupId) {
      return {
        ok: false,
        requestJson: { campaignId: campaignResult.campaignId },
        errorMessage: adGroupResult.errorMessage ?? "Falha ao criar o grupo de anúncios",
        rollbackInfoJson: { platform: "GOOGLE", campaignId: campaignResult.campaignId, note: "Campanha criada sem grupo de anúncios - pausar/remover manualmente." },
      };
    }

    const keywordsResult = await createGoogleKeywords(credential, {
      adGroupResourceName: adGroupResult.resourceName,
      keywords: plan.googleKeywords,
    });
    if (!keywordsResult.ok) {
      return {
        ok: false,
        requestJson: { adGroupId: adGroupResult.adGroupId },
        errorMessage: keywordsResult.errorMessage ?? "Falha ao criar as palavras-chave",
        rollbackInfoJson: { platform: "GOOGLE", campaignId: campaignResult.campaignId, note: "Campanha/grupo criados sem palavras-chave - pausar/remover manualmente." },
      };
    }

    const adResult = await createGoogleResponsiveSearchAd(credential, {
      adGroupResourceName: adGroupResult.resourceName,
      headlines: plan.googleAd.headlines,
      descriptions: plan.googleAd.descriptions,
      finalUrl: plan.finalUrl,
      status: "PAUSED",
    });
    if (!adResult.ok || !adResult.adId) {
      return {
        ok: false,
        requestJson: { adGroupId: adGroupResult.adGroupId },
        errorMessage: adResult.errorMessage ?? "Falha ao criar o anúncio (Responsive Search Ad)",
        rollbackInfoJson: { platform: "GOOGLE", campaignId: campaignResult.campaignId, note: "Campanha/grupo criados sem anúncio - pausar/remover manualmente." },
      };
    }

    return {
      ok: true,
      requestJson: { campaignName: plan.campaignName, dailyBudget: plan.dailyBudget },
      responseJson: { campaignId: campaignResult.campaignId, adGroupId: adGroupResult.adGroupId, adId: adResult.adId },
      createdIds: {
        platformCampaignId: campaignResult.campaignId,
        platformAdSetId: adGroupResult.adGroupId,
        platformAdId: adResult.adId,
      },
      rollbackInfoJson: {
        platform: "GOOGLE",
        campaignId: campaignResult.campaignId,
        note: "Pausar a campanha manualmente no Google Ads pra reverter.",
      },
    };
  }

  if (proposal.type === "NEW_FUNNEL") {
    if (proposal.platform !== "META") {
      throw new Error("NEW_FUNNEL só é suportado no Meta nesta versão");
    }
    const payload = proposal.payloadJson as { funnelPlan?: FunnelPlan } | null;
    const plan = payload?.funnelPlan;
    if (!plan) {
      throw new Error("Proposta sem funnelPlan em payloadJson");
    }

    const layerRows = await prisma.proposalFunnelLayer.findMany({ where: { proposalId: proposal.id } });
    const layerByKey = new Map(layerRows.map((l) => [l.layerKey, l]));
    const frio = layerByKey.get("FRIO");
    const morno = layerByKey.get("MORNO");
    const quente = layerByKey.get("QUENTE");
    const remarketing = layerByKey.get("REMARKETING");
    const lookalike = layerByKey.get("LOOKALIKE");
    if (!frio || !morno || !quente || !remarketing || !lookalike) {
      throw new Error("Proposta de funil sem as 5 camadas gravadas - dado inconsistente");
    }

    const pageResult = await resolveMetaPageId(credential);
    if (!pageResult.ok || !pageResult.pageId) {
      return {
        ok: false,
        requestJson: { productName: plan.productName },
        errorMessage: pageResult.errorMessage ?? "Falha ao resolver a Página do Facebook da conta",
      };
    }
    const pageId = pageResult.pageId;

    const interestIds: string[] = [];
    for (const interest of plan.metaTargeting.interests) {
      const matches = await searchMetaInterests(credential, interest);
      if (matches.length === 0) {
        return {
          ok: false,
          requestJson: { productName: plan.productName },
          errorMessage: `Não foi possível resolver o interesse "${interest}" no Meta`,
        };
      }
      interestIds.push(matches[0].id);
    }

    // Publicos de ENGAJAMENTO COM A PAGINA - proxy disponivel hoje, nao o mecanismo
    // ideal da spec. Duas limitacoes reais, documentadas aqui pra quem for revisar os
    // numeros depois nao achar que e precisao que nao existe:
    // 1. Nao ha audience por VIDEO especifico (o formato do `rule` pra isso nao foi
    //    confirmado na doc oficial - ver nota no topo de metaAudiences.ts) - entao
    //    Morno/Quente nao distinguem QUAL video/gancho a pessoa viu, so que ela
    //    interagiu com a Pagina de algum jeito.
    // 2. Sem Pixel/Conversions API em lugar nenhum do sistema, nao ha como saber quem
    //    CONVERTEU - Remarketing (retina quem viu e nao converteu) e Lookalike
    //    (semeado por quem comprou) viram aproximacoes por engajamento, nao pelo sinal
    //    de verdade que a spec pede.
    const mornoAudienceResult = await createMetaEngagementAudience(credential, {
      name: `${plan.productName} - Morno (engajou com a Página)`,
      inclusionRules: [
        {
          eventSourceType: "page",
          eventSourceIds: [pageId],
          retentionDays: 60,
          filters: [{ field: "event", operator: "eq", value: PAGE_ENGAGEMENT_EVENTS.ENGAGED }],
        },
      ],
    });
    if (!mornoAudienceResult.ok || !mornoAudienceResult.audienceId) {
      return {
        ok: false,
        requestJson: { productName: plan.productName },
        errorMessage: mornoAudienceResult.errorMessage ?? "Falha ao criar o público de Morno",
      };
    }

    // CTA_CLICKED (clicou num botao de call-to-action) e um sinal de intencao mais
    // forte que engajamento generico - a aproximacao mais proxima de "quente"
    // disponivel sem audience por video.
    const quenteAudienceResult = await createMetaEngagementAudience(credential, {
      name: `${plan.productName} - Quente (clicou CTA da Página)`,
      inclusionRules: [
        {
          eventSourceType: "page",
          eventSourceIds: [pageId],
          retentionDays: 30,
          filters: [{ field: "event", operator: "eq", value: PAGE_ENGAGEMENT_EVENTS.CTA_CLICKED }],
        },
      ],
    });
    if (!quenteAudienceResult.ok || !quenteAudienceResult.audienceId) {
      return {
        ok: false,
        requestJson: { productName: plan.productName },
        errorMessage: quenteAudienceResult.errorMessage ?? "Falha ao criar o público de Quente",
      };
    }

    // Mesma fonte do Morno, janela mais longa (120d) - aproxima as sub-janelas de
    // 20/60/120 dias da spec com uma unica camada mais duradoura, ate uma versao
    // futura separar isso em 3 campanhas de remarketing de verdade.
    const remarketingAudienceResult = await createMetaEngagementAudience(credential, {
      name: `${plan.productName} - Remarketing (engajou, janela longa)`,
      inclusionRules: [
        {
          eventSourceType: "page",
          eventSourceIds: [pageId],
          retentionDays: 120,
          filters: [{ field: "event", operator: "eq", value: PAGE_ENGAGEMENT_EVENTS.ENGAGED }],
        },
      ],
    });
    if (!remarketingAudienceResult.ok || !remarketingAudienceResult.audienceId) {
      return {
        ok: false,
        requestJson: { productName: plan.productName },
        errorMessage: remarketingAudienceResult.errorMessage ?? "Falha ao criar o público de Remarketing",
      };
    }

    // Lookalike PODE falhar de verdade numa conta nova - a Meta exige >= 100 pessoas na
    // semente, e um publico de engajamento recem-criado comeca vazio (so enche com o
    // tempo, depois que Frio/Morno rodarem de verdade). Isso NAO derruba o funil
    // inteiro: as outras 4 camadas continuam sendo criadas, so o 1% fica de fora, com o
    // motivo explicado no resultado final.
    const lookalikeAudienceResult = await createMetaLookalikeAudience(credential, {
      name: `${plan.productName} - 1% (lookalike de Morno)`,
      originAudienceId: mornoAudienceResult.audienceId,
      country: plan.metaTargeting.countries[0],
      ratio: 0.01,
    });

    const layerResults = new Map<FunnelLayerKey, FunnelLayerResult>();

    layerResults.set(
      "FRIO",
      await createMetaFunnelLayerAd(credential, {
        pageId,
        campaignName: frio.campaignName,
        dailyBudgetMinorUnits: frio.dailyBudgetMinorUnits,
        headline: frio.headline,
        primaryText: frio.primaryText,
        description: frio.description,
        callToAction: frio.callToAction,
        finalUrl: plan.finalUrl,
        layer: frio,
        targeting: {
          countries: plan.metaTargeting.countries,
          ageMin: plan.metaTargeting.ageMin,
          ageMax: plan.metaTargeting.ageMax,
          interestIds,
          // Quem ja engajou (Morno) ou ja demonstrou intencao forte (Quente) nao
          // precisa continuar vendo o anuncio de topo de funil - o mecanismo real de
          // "ja viu, nao mostra de novo" da secao 5 da spec.
          excludedCustomAudienceIds: [mornoAudienceResult.audienceId, quenteAudienceResult.audienceId],
        },
      })
    );

    layerResults.set(
      "MORNO",
      await createMetaFunnelLayerAd(credential, {
        pageId,
        campaignName: morno.campaignName,
        dailyBudgetMinorUnits: morno.dailyBudgetMinorUnits,
        headline: morno.headline,
        primaryText: morno.primaryText,
        description: morno.description,
        callToAction: morno.callToAction,
        finalUrl: plan.finalUrl,
        layer: morno,
        targeting: {
          countries: plan.metaTargeting.countries,
          ageMin: plan.metaTargeting.ageMin,
          ageMax: plan.metaTargeting.ageMax,
          interestIds: [],
          customAudienceIds: [mornoAudienceResult.audienceId],
          excludedCustomAudienceIds: [quenteAudienceResult.audienceId],
        },
      })
    );

    layerResults.set(
      "QUENTE",
      await createMetaFunnelLayerAd(credential, {
        pageId,
        campaignName: quente.campaignName,
        dailyBudgetMinorUnits: quente.dailyBudgetMinorUnits,
        headline: quente.headline,
        primaryText: quente.primaryText,
        description: quente.description,
        callToAction: quente.callToAction,
        finalUrl: plan.finalUrl,
        layer: quente,
        targeting: {
          countries: plan.metaTargeting.countries,
          ageMin: plan.metaTargeting.ageMin,
          ageMax: plan.metaTargeting.ageMax,
          interestIds: [],
          customAudienceIds: [quenteAudienceResult.audienceId],
        },
      })
    );

    layerResults.set(
      "REMARKETING",
      await createMetaFunnelLayerAd(credential, {
        pageId,
        campaignName: remarketing.campaignName,
        dailyBudgetMinorUnits: remarketing.dailyBudgetMinorUnits,
        headline: remarketing.headline,
        primaryText: remarketing.primaryText,
        description: remarketing.description,
        callToAction: remarketing.callToAction,
        finalUrl: plan.finalUrl,
        layer: remarketing,
        targeting: {
          countries: plan.metaTargeting.countries,
          ageMin: plan.metaTargeting.ageMin,
          ageMax: plan.metaTargeting.ageMax,
          interestIds: [],
          customAudienceIds: [remarketingAudienceResult.audienceId],
        },
      })
    );

    if (lookalikeAudienceResult.ok && lookalikeAudienceResult.audienceId) {
      layerResults.set(
        "LOOKALIKE",
        await createMetaFunnelLayerAd(credential, {
          pageId,
          campaignName: lookalike.campaignName,
          dailyBudgetMinorUnits: lookalike.dailyBudgetMinorUnits,
          headline: lookalike.headline,
          primaryText: lookalike.primaryText,
          description: lookalike.description,
          callToAction: lookalike.callToAction,
          finalUrl: plan.finalUrl,
          layer: lookalike,
          targeting: {
            countries: plan.metaTargeting.countries,
            ageMin: plan.metaTargeting.ageMin,
            ageMax: plan.metaTargeting.ageMax,
            interestIds: [],
            customAudienceIds: [lookalikeAudienceResult.audienceId],
          },
        })
      );
    } else {
      layerResults.set("LOOKALIKE", {
        ok: false,
        errorMessage:
          lookalikeAudienceResult.errorMessage ??
          "Público semente pequeno demais pra criar o 1% agora - normal em conta nova, tente de novo depois que Morno tiver mais gente.",
      });
    }

    const audienceIdByLayer: Partial<Record<FunnelLayerKey, string | null>> = {
      MORNO: mornoAudienceResult.audienceId,
      QUENTE: quenteAudienceResult.audienceId,
      REMARKETING: remarketingAudienceResult.audienceId,
      LOOKALIKE: lookalikeAudienceResult.audienceId ?? null,
    };

    // Persiste o resultado de CADA camada na propria linha - e o que um
    // ADJUST_BUDGET/PAUSE_AD por camada, ou uma tela de acompanhamento futura, vai
    // ler, sem precisar reprocessar payloadJson.
    for (const [layerKey, result] of layerResults) {
      const row = layerByKey.get(layerKey)!;
      await prisma.proposalFunnelLayer.update({
        where: { id: row.id },
        data: {
          platformCampaignId: result.campaignId ?? null,
          platformAdSetId: result.adSetId ?? null,
          platformAdId: result.adId ?? null,
          customAudienceId: audienceIdByLayer[layerKey] ?? null,
        },
      });
    }

    const frioResult = layerResults.get("FRIO")!;
    const succeeded = [...layerResults.entries()].filter(([, r]) => r.ok).map(([k]) => k);
    const failed = [...layerResults.entries()].filter(([, r]) => !r.ok);

    return {
      // FRIO e a camada obrigatoria - sem ela nao ha funil nenhum, so audiencias
      // criadas a toa. As outras 4 sao best-effort: Lookalike falhar numa conta nova e
      // ESPERADO (comentado acima); Morno/Quente/Remarketing falhar e menos comum mas
      // nao impede o Frio (independente de audiencia) de ter rodado.
      ok: frioResult.ok,
      requestJson: { productName: plan.productName, totalDailyBudget: plan.totalDailyBudget },
      responseJson: {
        layers: Object.fromEntries(layerResults),
        audiences: {
          morno: mornoAudienceResult.audienceId,
          quente: quenteAudienceResult.audienceId,
          remarketing: remarketingAudienceResult.audienceId,
          lookalike: lookalikeAudienceResult.audienceId ?? null,
        },
      },
      errorMessage: frioResult.ok
        ? failed.length > 0
          ? `Funil criado parcialmente (${succeeded.length}/5 camadas) - falhou: ${failed.map(([k]) => k).join(", ")}`
          : undefined
        : (frioResult.errorMessage ?? "Falha ao criar a camada Frio"),
      rollbackInfoJson: {
        platform: "META",
        campaignIds: succeeded.map((k) => layerResults.get(k)?.campaignId).filter(Boolean),
        note: "Pausar cada campanha manualmente no Gerenciador de Anúncios pra reverter.",
      },
    };
  }

  throw new Error(`Tipo de proposta ${proposal.type} ainda nao suporta execucao automatica`);
}

/**
 * Unico ponto do sistema que pode chamar ads/metaWrite.ts ou ads/googleWrite.ts.
 * So executa se a proposta ja estiver APPROVED (ou TEST) - reconfere isso e a
 * transicao de estado via lib/proposals/lifecycle.ts antes de qualquer chamada real,
 * e sempre grava um ExecutionLog (sucesso ou falha), nunca um caminho de silencio.
 */
export async function executeProposal(proposalId: string, userId: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });

  if (proposal.status !== "APPROVED" && proposal.status !== "TEST") {
    throw new Error(`Proposta precisa estar aprovada antes de executar (está em ${proposal.status})`);
  }

  let dispatch: DispatchResult;
  try {
    dispatch = await dispatchExecution(proposal);
  } catch (error) {
    dispatch = {
      ok: false,
      requestJson: null,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }

  const newStatus: ProposalStatus = dispatch.ok ? "EXECUTED" : "EXECUTION_FAILED";
  assertProposalTransition(proposal.status as ProposalStatus, newStatus);

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: newStatus,
      // So NEW_CAMPAIGN preenche isto - a proposta nao tinha IDs reais antes de
      // executar, diferente dos outros tipos (que ja agiam sobre algo existente).
      ...(dispatch.ok && dispatch.createdIds
        ? {
            platformCampaignId: dispatch.createdIds.platformCampaignId,
            platformAdSetId: dispatch.createdIds.platformAdSetId,
            platformAdId: dispatch.createdIds.platformAdId,
          }
        : {}),
    },
  });

  const executionLog = await prisma.executionLog.create({
    data: {
      proposalId,
      credentialId: proposal.credentialId,
      executedByUserId: userId,
      platform: proposal.platform!,
      action: proposal.type as ExecutionAction,
      requestJson: JSON.parse(JSON.stringify(dispatch.requestJson ?? {})),
      responseJson: dispatch.responseJson ? JSON.parse(JSON.stringify(dispatch.responseJson)) : undefined,
      status: dispatch.ok ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED,
      errorMessage: dispatch.errorMessage,
      rollbackInfoJson: dispatch.rollbackInfoJson ? JSON.parse(JSON.stringify(dispatch.rollbackInfoJson)) : undefined,
    },
  });

  if (dispatch.ok && dispatch.abTestSetup) {
    await prisma.abTest.create({
      data: {
        proposalId,
        credentialId: proposal.credentialId,
        platform: proposal.platform!,
        controlAdId: dispatch.abTestSetup.controlAdId,
        controlAdSetId: dispatch.abTestSetup.controlAdSetId,
        variantAdId: dispatch.abTestSetup.variantAdId,
        variantAdSetId: dispatch.abTestSetup.variantAdSetId,
        testedVariable: "BUDGET",
        controlValue: dispatch.abTestSetup.controlValue,
        variantValue: dispatch.abTestSetup.variantValue,
        endsAt: dispatch.abTestSetup.endsAt,
        status: "RUNNING",
      },
    });
  }

  return executionLog;
}
