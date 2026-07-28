import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateBrandSchema } from "@/lib/brands/schema";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "VIEWER");

    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "MANAGER");

    const body = updateBrandSchema.parse(await request.json());

    const brand = await prisma.brand.update({
      where: { id: brandId },
      data: body,
    });

    return NextResponse.json({ brand });
  } catch (error) {
    return handleApiError(error);
  }
}
