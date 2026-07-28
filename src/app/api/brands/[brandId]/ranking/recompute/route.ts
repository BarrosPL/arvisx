import { NextRequest, NextResponse } from "next/server";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { computeAndSaveRanking } from "@/lib/ranking/compute";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "VIEWER");

    const ranking = await computeAndSaveRanking(brandId);
    return NextResponse.json({ ranking });
  } catch (error) {
    return handleApiError(error);
  }
}
