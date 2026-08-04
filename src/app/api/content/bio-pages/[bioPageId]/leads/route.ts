import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

const LEAD_LIST_LIMIT = 200;

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);

    const leads = await prisma.lead.findMany({
      where: { leadForm: { bioPageId } },
      orderBy: { createdAt: "desc" },
      take: LEAD_LIST_LIMIT,
      include: { leadForm: { select: { name: true } } },
    });

    return NextResponse.json({ leads, truncated: leads.length === LEAD_LIST_LIMIT });
  } catch (error) {
    return handleApiError(error);
  }
}
