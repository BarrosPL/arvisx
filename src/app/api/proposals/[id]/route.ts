import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBrandAccess } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertProposalTransition, type ProposalStatus } from "@/lib/proposals/lifecycle";
import { deleteProposal } from "@/lib/proposals/deleteProposal";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const editSchema = z.object({
  title: z.string().min(3).optional(),
  suggestedAction: z.string().min(3).optional(),
  proposedBudget: z.number().positive().optional(),
});

/**
 * Edita uma proposta em ADJUST (unico status editavel) e ja reabre pra PENDING na
 * mesma chamada - diferente de /reopen (que so muda status), essa rota deixa
 * corrigir de verdade o valor/acao antes de voltar pra fila.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id } });
    const { user } = await requireBrandAccess(proposal.brandId, "MANAGER");

    if (proposal.status !== "ADJUST") {
      throw new Error(`Só é possível editar propostas em "Ajustar" (está em ${proposal.status})`);
    }
    assertProposalTransition(proposal.status as ProposalStatus, "PENDING");

    const body = editSchema.parse(await request.json());

    const currentMetrics = (proposal.metricsJson as Record<string, unknown>) ?? {};
    const metricsJson =
      body.proposedBudget !== undefined ? { ...currentMetrics, proposedBudget: body.proposedBudget } : currentMetrics;

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        title: body.title ?? proposal.title,
        suggestedAction: body.suggestedAction ?? proposal.suggestedAction,
        metricsJson: JSON.parse(JSON.stringify(metricsJson)),
        status: "PENDING",
        decidedByUserId: user.id,
        decidedAt: new Date(),
        decisionNote: null,
      },
    });

    return NextResponse.json({ proposal: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclui a proposta de verdade (ver deleteProposal.ts pra regra de bloqueio). */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await deleteProposal(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
