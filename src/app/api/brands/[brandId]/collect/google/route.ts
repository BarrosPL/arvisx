import { NextRequest, NextResponse } from "next/server";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { collectForBrand } from "@/lib/ads/collect";
import { fetchGoogleAdsInsights } from "@/lib/ads/google";

interface RouteParams {
  params: Promise<{ brandId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { brandId } = await params;
    await requireBrandAccess(brandId, "MANAGER");

    const summaries = await collectForBrand(brandId, "GOOGLE", fetchGoogleAdsInsights);
    return NextResponse.json({ summaries });
  } catch (error) {
    return handleApiError(error);
  }
}
