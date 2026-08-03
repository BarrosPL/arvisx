import { prisma } from "@/lib/prisma";
import type { ListProposalsArgs } from "@/lib/agent/schema";

/**
 * Lista propostas de uma conta pra JAMILE conseguir achar a certa a partir de uma
 * DESCRICAO do usuario (ex: "aquela proposta de pausar a campanha X de ontem"), em vez
 * de exigir o id exato que so get_proposal aceita. Mais recente primeiro, limitado -
 * isto e pra reconhecimento pelo modelo, nao um relatorio completo.
 */
export async function listProposals(credentialId: string, args: ListProposalsArgs) {
  const proposals = await prisma.proposal.findMany({
    where: {
      credentialId,
      ...(args.status ? { status: args.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: args.limit,
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      platform: true,
      createdAt: true,
    },
  });

  return {
    count: proposals.length,
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      type: proposal.type,
      status: proposal.status,
      title: proposal.title,
      platform: proposal.platform,
      createdAt: proposal.createdAt.toISOString(),
    })),
  };
}
