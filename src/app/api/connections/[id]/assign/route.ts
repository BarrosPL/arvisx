import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireBrandAccess, ForbiddenError } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { redactCredential } from "@/lib/ads/credentials";
import { collectForBrand, type CollectSummary } from "@/lib/ads/collect";
import { collectAdLibraryForBrand } from "@/lib/ads/collectLibrary";
import { fetchMetaInsights } from "@/lib/ads/meta";
import { fetchGoogleAdsInsights } from "@/lib/ads/google";
import { fetchMetaAdLibrary } from "@/lib/ads/metaLibrary";
import { fetchGoogleAdLibrary } from "@/lib/ads/googleLibrary";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const assignSchema = z.object({
  externalAccountId: z.string().min(1),
  brandId: z.string().min(1),
  label: z.string().optional(),
  loginCustomerId: z.string().optional(),
});

const unassignSchema = z.object({
  externalAccountId: z.string().min(1),
});

async function requireOwnConnection(id: string) {
  const user = await requireUser();
  const connection = await prisma.providerConnection.findUniqueOrThrow({ where: { id } });
  if (connection.userId !== user.id) throw new ForbiddenError();
  return connection;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const connection = await requireOwnConnection(id);
    const body = assignSchema.parse(await request.json());

    await requireBrandAccess(body.brandId, "MANAGER");

    const credential = await prisma.adCredential.upsert({
      where: {
        platform_externalAccountId: {
          platform: connection.platform,
          externalAccountId: body.externalAccountId,
        },
      },
      update: {
        brandId: body.brandId,
        providerConnectionId: connection.id,
        label: body.label,
        loginCustomerId: body.loginCustomerId ?? null,
        status: "CONNECTED",
        lastCheckedAt: new Date(),
        lastError: null,
      },
      create: {
        brandId: body.brandId,
        providerConnectionId: connection.id,
        platform: connection.platform,
        externalAccountId: body.externalAccountId,
        label: body.label,
        loginCustomerId: body.loginCustomerId ?? null,
        status: "CONNECTED",
        lastCheckedAt: new Date(),
      },
    });

    // Primeira coleta acontece na hora, pra nao depender do usuario clicar em nada nem
    // esperar a proxima rodada do scheduler - se falhar (ex: token com escopo
    // insuficiente), a atribuicao ja aconteceu de qualquer forma e o scheduler tenta
    // de novo sozinho na proxima rodada automatica.
    let collectSummary: CollectSummary | null = null;
    try {
      const fetcher = connection.platform === "META" ? fetchMetaInsights : fetchGoogleAdsInsights;
      const summaries = await collectForBrand(body.brandId, connection.platform, fetcher);
      collectSummary = summaries.find((s) => s.credentialId === credential.id) ?? null;
    } catch {
      // best-effort - ver comentario acima
    }
    try {
      const libraryFetcher = connection.platform === "META" ? fetchMetaAdLibrary : fetchGoogleAdLibrary;
      await collectAdLibraryForBrand(body.brandId, connection.platform, libraryFetcher);
    } catch {
      // best-effort - mesma logica: biblioteca de anuncios nao pode falhar a atribuicao
    }

    return NextResponse.json(
      { credential: redactCredential(credential), collectSummary },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const connection = await requireOwnConnection(id);
    const body = unassignSchema.parse(await request.json());

    const existing = await prisma.adCredential.findUnique({
      where: {
        platform_externalAccountId: {
          platform: connection.platform,
          externalAccountId: body.externalAccountId,
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ ok: true });
    }

    await requireBrandAccess(existing.brandId, "MANAGER");
    await prisma.adCredential.delete({ where: { id: existing.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
