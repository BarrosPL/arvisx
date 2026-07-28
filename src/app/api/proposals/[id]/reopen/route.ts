import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/http";
import { decideProposal } from "@/lib/proposals/decide";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Reabre uma proposta em ADJUST de volta pra PENDING (unico destino permitido - ver lifecycle.ts). */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const proposal = await decideProposal(id, "PENDING", null);
    return NextResponse.json({ proposal });
  } catch (error) {
    return handleApiError(error);
  }
}
