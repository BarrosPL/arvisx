import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { verifyOAuthState } from "@/lib/oauth/state";
import { exchangeGoogleCode } from "@/lib/oauth/google";
import { encryptSecret } from "@/lib/crypto";
import { redirectForOAuthError } from "@/lib/oauth/errors";
import { autoProvisionAccountsForConnection } from "@/lib/accounts/autoProvision";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");

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

    const { accessToken, refreshToken } = await exchangeGoogleCode(code);
    if (!refreshToken) {
      const url = new URL("/connections", request.url);
      url.searchParams.set(
        "oauth_error",
        "Google não retornou refresh token. Revogue o acesso do app em myaccount.google.com/permissions e tente conectar de novo."
      );
      return NextResponse.redirect(url);
    }

    // Um usuario so pode ter uma conexao por plataforma (ProviderConnection_userId_platform_key) -
    // reconectar (ex: pra renovar um refresh token revogado) atualiza a conexao existente em vez
    // de criar outra, senao AdCredential/marcas ja atribuidas a ela ficariam orfas de token valido.
    const connection = await prisma.providerConnection.upsert({
      where: { userId_platform: { userId, platform: "GOOGLE" } },
      create: {
        userId,
        platform: "GOOGLE",
        label: "Google Ads",
        encryptedAccessToken: encryptSecret(accessToken),
        encryptedRefreshToken: encryptSecret(refreshToken),
        status: "CONNECTED",
        lastCheckedAt: new Date(),
      },
      update: {
        encryptedAccessToken: encryptSecret(accessToken),
        encryptedRefreshToken: encryptSecret(refreshToken),
        status: "CONNECTED",
        lastError: null,
        lastCheckedAt: new Date(),
      },
    });

    // Cada conta descoberta ja vira sua propria marca automaticamente - nao bloqueia
    // o redirect se falhar, a pagina de conexoes tenta de novo no carregamento.
    try {
      await autoProvisionAccountsForConnection(connection.id);
    } catch (error) {
      console.error("[auto-provision] falhou no callback Google:", error);
    }

    const url = new URL("/connections", request.url);
    url.searchParams.set("connected", connection.id);
    return NextResponse.redirect(url);
  } catch (error) {
    return redirectForOAuthError(error, request, "Falha na conexão com o Google Ads");
  }
}
