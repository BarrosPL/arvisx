import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ForbiddenError } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { decryptSecret } from "@/lib/crypto";
import { listMetaAdAccounts } from "@/lib/oauth/meta";
import { listGoogleAccessibleCustomers } from "@/lib/oauth/google";
import { exchangeRefreshToken } from "@/lib/ads/google";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const connection = await prisma.providerConnection.findUniqueOrThrow({ where: { id } });
    if (connection.userId !== user.id) throw new ForbiddenError();

    let accounts;
    if (connection.platform === "META") {
      accounts = await listMetaAdAccounts(decryptSecret(connection.encryptedAccessToken));
    } else {
      if (!connection.encryptedRefreshToken) {
        throw new Error("Conexão Google sem refresh token — desconecte e conecte de novo.");
      }
      // O access token salvo dura ~1h; sempre renova via refresh token antes de listar contas.
      const freshAccessToken = await exchangeRefreshToken(decryptSecret(connection.encryptedRefreshToken));
      accounts = await listGoogleAccessibleCustomers(freshAccessToken);
    }

    // Toda conta descoberta ja vira um AdCredential automaticamente (ver
    // lib/accounts/autoProvision.ts) - nao ha mais atribuicao manual. Isto aqui so
    // informa quais ja estao registradas, pra UI mostrar o estado.
    const externalAccountIds = accounts.map((account) => account.externalAccountId);
    const registered = await prisma.adCredential.findMany({
      where: { platform: connection.platform, externalAccountId: { in: externalAccountIds } },
      select: { id: true, externalAccountId: true, providerConnectionId: true, status: true },
    });
    const registeredByAccountId = new Map(registered.map((a) => [a.externalAccountId, a]));

    return NextResponse.json({
      accounts: accounts.map((account) => {
        const match = registeredByAccountId.get(account.externalAccountId);
        return {
          ...account,
          credentialId: match?.id ?? null,
          status: match?.status ?? null,
          // Ja registrada por OUTRO login do sistema - por isso nao aparece nesta conexao.
          registeredViaOtherConnection: match ? match.providerConnectionId !== id : false,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
