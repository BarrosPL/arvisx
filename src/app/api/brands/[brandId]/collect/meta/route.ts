import { NextRequest, NextResponse } from "next/server";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { collectForBrand } from "@/lib/ads/collect";
import { fetchMetaInsights } from "@/lib/ads/meta";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "MANAGER");

    const summaries = await collectForBrand(brandId, "META", fetchMetaInsights);
    return NextResponse.json({ summaries });
  } catch (error) {
    return handleApiError(error);
  }
}
