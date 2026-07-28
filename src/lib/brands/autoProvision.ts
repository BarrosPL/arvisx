import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { listMetaAdAccounts } from "@/lib/oauth/meta";
import { listGoogleAccessibleCustomers } from "@/lib/oauth/google";
import { exchangeRefreshToken } from "@/lib/ads/google";
import { collectForBrand } from "@/lib/ads/collect";
import { collectAdLibraryForBrand } from "@/lib/ads/collectLibrary";
import { fetchMetaInsights } from "@/lib/ads/meta";
import { fetchGoogleAdsInsights } from "@/lib/ads/google";
import { fetchMetaAdLibrary } from "@/lib/ads/metaLibrary";
import { fetchGoogleAdLibrary } from "@/lib/ads/googleLibrary";
import type { Platform } from "@/generated/prisma/client";

function slugify(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "marca";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await prisma.brand.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`.slice(0, 40);
    suffix += 1;
  }
  return candidate;
}

export interface AutoProvisionResult {
  createdBrands: { brandId: string; brandName: string; externalAccountId: string }[];
  skipped: number;
}

/**
 * Cada conta de anuncio descoberta vira sua propria marca nova, automaticamente -
 * decisao explicita do Renan (2026-07-29), sabendo que hoje uma marca pode ter varias
 * contas Meta (nao e sempre 1:1) - ele preferiu simplicidade total (nunca pede pra
 * escolher) e consolidar manualmente depois se quiser, em vez de tentar casar por nome.
 * Nao afeta a garantia forte do firewall (AdCredential.@@unique([platform,
 * externalAccountId]) impede a mesma conta em duas marcas) - so pula contas que ja
 * tem credencial, de qualquer conexao do usuario.
 */
export async function autoProvisionBrandsForConnection(connectionId: string): Promise<AutoProvisionResult> {
  const connection = await prisma.providerConnection.findUniqueOrThrow({ where: { id: connectionId } });

  interface NormalizedAccount {
    externalAccountId: string;
    label: string;
    loginCustomerId: string | null;
  }

  const accounts: NormalizedAccount[] =
    connection.platform === "META"
      ? (await listMetaAdAccounts(decryptSecret(connection.encryptedAccessToken))).map((a) => ({
          ...a,
          loginCustomerId: null,
        }))
      : connection.encryptedRefreshToken
        ? await listGoogleAccessibleCustomers(
            await exchangeRefreshToken(decryptSecret(connection.encryptedRefreshToken))
          )
        : [];

  if (accounts.length === 0) {
    return { createdBrands: [], skipped: 0 };
  }

  const existing = await prisma.adCredential.findMany({
    where: { platform: connection.platform, externalAccountId: { in: accounts.map((a) => a.externalAccountId) } },
    select: { externalAccountId: true },
  });
  const existingIds = new Set(existing.map((e) => e.externalAccountId));
  const toProvision = accounts.filter((a) => !existingIds.has(a.externalAccountId));

  const createdBrands: AutoProvisionResult["createdBrands"] = [];

  for (const account of toProvision) {
    const slug = await uniqueSlug(slugify(account.label || account.externalAccountId));
    const brand = await prisma.brand.create({
      data: {
        slug,
        name: account.label || account.externalAccountId,
        // Diferente de uma marca criada manualmente do zero (ainda "em onboarding" -
        // sem conta nenhuma), esta ja nasce com uma conta de anuncio real e conectada -
        // conta pra "Marcas ativas" no dashboard desde o primeiro instante.
        status: "ACTIVE",
        topicKeywords: [],
        excludedKeywords: [],
        brandAccess: { create: { userId: connection.userId, role: "OWNER" } },
      },
    });

    await prisma.adCredential.create({
      data: {
        brandId: brand.id,
        providerConnectionId: connection.id,
        platform: connection.platform,
        externalAccountId: account.externalAccountId,
        loginCustomerId: account.loginCustomerId,
        label: account.label,
        status: "CONNECTED",
        lastCheckedAt: new Date(),
      },
    });

    createdBrands.push({ brandId: brand.id, brandName: brand.name, externalAccountId: account.externalAccountId });

    // Fire-and-forget de proposito - uma conexao pode expor dezenas de contas de uma
    // vez, e esperar a coleta real de cada uma sequencialmente travaria o
    // redirect/carregamento da pagina por muito tempo. O processo Node persiste (mesma
    // premissa do scheduler em instrumentation.ts), entao isso completa depois.
    void runBestEffortSync(brand.id, connection.platform);
  }

  return { createdBrands, skipped: accounts.length - toProvision.length };
}

async function runBestEffortSync(brandId: string, platform: Platform): Promise<void> {
  const metricsFetcher = platform === "META" ? fetchMetaInsights : fetchGoogleAdsInsights;
  const libraryFetcher = platform === "META" ? fetchMetaAdLibrary : fetchGoogleAdLibrary;
  try {
    await collectForBrand(brandId, platform, metricsFetcher);
  } catch {
    // best-effort - o scheduler tenta de novo sozinho na proxima rodada
  }
  try {
    await collectAdLibraryForBrand(brandId, platform, libraryFetcher);
  } catch {
    // best-effort
  }
}
