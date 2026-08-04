import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);

    const totals = await prisma.bioEvent.groupBy({
      by: ["event"],
      where: { bioPageId },
      _count: { _all: true },
    });
    const totalsByEvent = Object.fromEntries(totals.map((row) => [row.event, row._count._all]));
    const pageViews = totalsByEvent.PAGE_VIEW ?? 0;
    const blockClicks = totalsByEvent.BLOCK_CLICK ?? 0;
    const formSubmits = totalsByEvent.FORM_SUBMIT ?? 0;

    const byBlock = await prisma.bioEvent.groupBy({
      by: ["blockId"],
      where: { bioPageId, event: "BLOCK_CLICK", blockId: { not: null } },
      _count: { _all: true },
    });

    return NextResponse.json({
      pageViews,
      blockClicks,
      formSubmits,
      conversionRate: pageViews > 0 ? formSubmits / pageViews : 0,
      clicksByBlock: byBlock.map((row) => ({ blockId: row.blockId, clicks: row._count._all })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
