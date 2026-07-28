import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/http";
import { decideProposal } from "@/lib/proposals/decide";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({ note: z.string().min(1, "Motivo obrigatorio") });

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const proposal = await decideProposal(id, "ADJUST", body.note);
    return NextResponse.json({ proposal });
  } catch (error) {
    return handleApiError(error);
  }
}
