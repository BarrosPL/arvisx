import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { listMetaAdAccounts } from "@/lib/oauth/meta";
import { listGoogleAccessibleCustomers } from "@/lib/oauth/google";
import { exchangeRefreshToken } from "@/lib/ads/google";
import { collectAdMetricsForAccount } from "@/lib/ads/collect";
import { collectAdLibraryForAccount } from "@/lib/ads/collectLibrary";
import { collectAllCampaignsForAccount } from "@/lib/ads/collectCampaigns";
import { fetchMetaInsights } from "@/lib/ads/meta";
import { fetchGoogleAdsInsights } from "@/lib/ads/google";
import { fetchMetaAdLibrary } from "@/lib/ads/metaLibrary";
import { fetchGoogleAdLibrary } from "@/lib/ads/googleLibrary";
import type { Platform } from "@/generated/prisma/client";

export interface AutoProvisionResult {
  createdAccounts: { credentialId: string; label: string; externalAccountId: string }[];
  skipped: number;
  /** Preenchido quando a descoberta falhou (token sem permissao, API fora etc). Antes
   * esse erro so ia pro log do servidor e o usuario via zero contas sem entender por
   * que - agora quem chama pode mostrar na tela. */
  errorMessage?: string;
}

/**
 * Toda conta de anuncio visivel num login OAuth vira automaticamente um AdCredential
 * proprio - nao existe passo manual de atribuicao (o conceito de "Marca" que exigia isso
 * foi removido). Idempotente: pula conta que ja tem credencial.
 *
 * `(platform, externalAccountId)` e unico globalmente, entao uma conta ja registrada por
 * outro login e simplesmente pulada.
 */
export async function autoProvisionAccountsForConnection(connectionId: string): Promise<AutoProvisionResult> {
  const connection = await prisma.providerConnection.findUniqueOrThrow({ where: { id: connectionId } });

  interface DiscoveredAccount {
    externalAccountId: string;
    label: string;
    loginCustomerId: string | null;
  }

  let accounts: DiscoveredAccount[];
  try {
    accounts =
      connection.platform === "META"
        ? (await listMetaAdAccounts(decryptSecret(connection.encryptedAccessToken))).map((account) => ({
            ...account,
            loginCustomerId: null,
          }))
        : connection.encryptedRefreshToken
          ? await listGoogleAccessibleCustomers(
              await exchangeRefreshToken(decryptSecret(connection.encryptedRefreshToken))
            )
          : [];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao descobrir contas";
    // Registra no proprio ProviderConnection pra ficar visivel na tela de Conexoes,
    // em vez de virar so uma linha de log que ninguem le.
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "AUTH_ERROR", lastCheckedAt: new Date(), lastError: errorMessage },
    });
    return { createdAccounts: [], skipped: 0, errorMessage };
  }

  if (accounts.length === 0) {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
    return { createdAccounts: [], skipped: 0 };
  }

  const existing = await prisma.adCredential.findMany({
    where: { platform: connection.platform, externalAccountId: { in: accounts.map((a) => a.externalAccountId) } },
    select: { externalAccountId: true },
  });
  const existingIds = new Set(existing.map((e) => e.externalAccountId));
  const toProvision = accounts.filter((a) => !existingIds.has(a.externalAccountId));

  const createdAccounts: AutoProvisionResult["createdAccounts"] = [];

  for (const account of toProvision) {
    const credential = await prisma.adCredential.create({
      data: {
        providerConnectionId: connection.id,
        platform: connection.platform,
        externalAccountId: account.externalAccountId,
        loginCustomerId: account.loginCustomerId,
        label: account.label || account.externalAccountId,
        status: "CONNECTED",
        lastCheckedAt: new Date(),
      },
    });

    createdAccounts.push({
      credentialId: credential.id,
      label: credential.label ?? account.externalAccountId,
      externalAccountId: account.externalAccountId,
    });

    // Fire-and-forget de proposito - uma conexao pode expor dezenas de contas, e esperar
    // a coleta de cada uma travaria o redirect. O processo Node persiste (mesma premissa
    // do scheduler em instrumentation.ts), entao isso completa depois.
    void runBestEffortSync(credential.id, connection.platform);
  }

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { status: "CONNECTED", lastCheckedAt: new Date(), lastError: null },
  });

  return { createdAccounts, skipped: accounts.length - toProvision.length };
}

async function runBestEffortSync(credentialId: string, platform: Platform): Promise<void> {
  // A de campanha vem primeiro: e a que alimenta o dashboard, entao e a que o usuario
  // espera ver logo depois de conectar.
  try {
    await collectAllCampaignsForAccount(credentialId);
  } catch {
    // best-effort - o ciclo de coleta tenta de novo sozinho
  }
  try {
    await collectAdMetricsForAccount(credentialId, platform, platform === "META" ? fetchMetaInsights : fetchGoogleAdsInsights);
  } catch {
    // best-effort
  }
  try {
    await collectAdLibraryForAccount(
      credentialId,
      platform,
      platform === "META" ? fetchMetaAdLibrary : fetchGoogleAdLibrary
    );
  } catch {
    // best-effort
  }
}
