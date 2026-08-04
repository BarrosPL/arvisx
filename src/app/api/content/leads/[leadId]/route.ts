import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireLeadAccess } from "@/lib/content/access";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

const updateLeadSchema = z.object({
  status: z.enum(["NEW", "SPAM", "ARCHIVED"]),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadId } = await params;
    await requireLeadAccess(leadId);
    const body = updateLeadSchema.parse(await request.json());

    const lead = await prisma.lead.update({ where: { id: leadId }, data: { status: body.status } });
    return NextResponse.json({ lead });
  } catch (error) {
    return handleApiError(error);
  }
}
