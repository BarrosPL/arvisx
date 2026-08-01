import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { verifyOAuthState } from "@/lib/oauth/state";
import { exchangeMetaCodeForShortLivedToken, exchangeForLongLivedToken } from "@/lib/oauth/meta";
import { encryptSecret } from "@/lib/crypto";
import { redirectForOAuthError } from "@/lib/oauth/errors";
import { autoProvisionAccountsForConnection } from "@/lib/accounts/autoProvision";

async function fetchMetaAccountName(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=name&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { name?: string };
    return body.name ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error_message") || searchParams.get("error");

  try {
    if (!state) throw new Error("state ausente no callback");
    const { userId } = verifyOAuthState(state);

    const user = await requireUser();
    if (user.id !== userId) throw new Error("Sessão não corresponde ao state OAuth");

    if (providerError || !code) {
      const url = new URL("/connections", request.url);
      url.searchParams.set("oauth_error", providerError ?? "Conexão cancelada");
      return NextResponse.redirect(url);
    }

    const shortLivedToken = await exchangeMetaCodeForShortLivedToken(code);
    const { accessToken, expiresInSeconds } = await exchangeForLongLivedToken(shortLivedToken);
    const accountName = await fetchMetaAccountName(accessToken);

    const label = accountName ? `Meta — ${accountName}` : "Meta Ads";
    const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;

    // Um usuario so pode ter uma conexao por plataforma (ProviderConnection_userId_platform_key) -
    // reconectar (ex: pra renovar um token expirado) atualiza a conexao existente em vez de criar
    // outra, senao as contas ja registradas por ela ficariam orfas de token valido.
    const connection = await prisma.providerConnection.upsert({
      where: { userId_platform: { userId, platform: "META" } },
      create: {
        userId,
        platform: "META",
        label,
        encryptedAccessToken: encryptSecret(accessToken),
        tokenExpiresAt,
        status: "CONNECTED",
        lastCheckedAt: new Date(),
      },
      update: {
        label,
        encryptedAccessToken: encryptSecret(accessToken),
        tokenExpiresAt,
        status: "CONNECTED",
        lastError: null,
        lastCheckedAt: new Date(),
      },
    });

    // Cada conta descoberta ja entra no sistema automaticamente - nao bloqueia
    // o redirect se falhar, a pagina de conexoes tenta de novo no carregamento.
    try {
      await autoProvisionAccountsForConnection(connection.id);
    } catch (error) {
      console.error("[auto-provision] falhou no callback Meta:", error);
    }

    const url = new URL("/connections", request.url);
    url.searchParams.set("connected", connection.id);
    return NextResponse.redirect(url);
  } catch (error) {
    return redirectForOAuthError(error, request, "Falha na conexão com o Meta");
  }
}
