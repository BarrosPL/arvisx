import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { toPlatformCredential } from "@/lib/ads/credentials";
import { searchPublicAdLibrary } from "@/lib/ads/publicAdLibrary";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

const searchSchema = z.object({
  query: z.string().min(2),
  countries: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId);
    const body = searchSchema.parse(await request.json());

    // Biblioteca publica e dado publico - nao precisa ser dono da conta, so um token
    // Meta valido qualquer ja conectado a esta marca (mesmo padrao de get_ad_budget).
    const credentialRecord = await prisma.adCredential.findFirst({
      where: { brandId, platform: "META" },
      include: { providerConnection: true },
    });
    if (!credentialRecord) {
      return NextResponse.json(
        { error: "Nenhuma conta Meta conectada a esta marca ainda - conecte uma em Credenciais." },
        { status: 400 }
      );
    }

    const result = await searchPublicAdLibrary(toPlatformCredential(credentialRecord), {
      query: body.query,
      countries: body.countries,
    });

    if (result.errorMessage) {
      return NextResponse.json({ error: result.errorMessage }, { status: 502 });
    }
    return NextResponse.json({ items: result.items });
  } catch (error) {
    return handleApiError(error);
  }
}
