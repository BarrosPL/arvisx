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

    const externalAccountIds = accounts.map((account) => account.externalAccountId);
    const assignments = await prisma.adCredential.findMany({
      where: { platform: connection.platform, externalAccountId: { in: externalAccountIds } },
      include: { brand: { select: { id: true, slug: true, name: true } } },
    });
    const assignmentByAccountId = new Map(assignments.map((a) => [a.externalAccountId, a]));

    return NextResponse.json({
      accounts: accounts.map((account) => {
        const assignment = assignmentByAccountId.get(account.externalAccountId);
        return {
          ...account,
          assignedBrand: assignment ? assignment.brand : null,
          assignedViaOtherConnection: assignment ? assignment.providerConnectionId !== id : false,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
