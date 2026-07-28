import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ForbiddenError } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { decryptSecret } from "@/lib/crypto";
import { redactConnection } from "@/lib/ads/credentials";
import { probeMetaConnection } from "@/lib/oauth/meta";
import { probeGoogleConnection } from "@/lib/oauth/google";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const connection = await prisma.providerConnection.findUniqueOrThrow({ where: { id } });
    if (connection.userId !== user.id) throw new ForbiddenError();

    const probe =
      connection.platform === "META"
        ? await probeMetaConnection(decryptSecret(connection.encryptedAccessToken))
        : await probeGoogleConnection(decryptSecret(connection.encryptedRefreshToken ?? ""));

    const updated = await prisma.providerConnection.update({
      where: { id },
      data: {
        status: probe.ok ? "CONNECTED" : "AUTH_ERROR",
        lastCheckedAt: new Date(),
        lastError: probe.ok ? null : (probe.message ?? "Falha desconhecida"),
      },
    });

    return NextResponse.json({ connection: redactConnection(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
