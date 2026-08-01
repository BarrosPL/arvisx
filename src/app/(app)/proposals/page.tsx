import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProposalsBoard } from "@/components/proposals-board";
import { PageHeader } from "@/components/page-header";
import { toProposalView } from "@/lib/proposals/view";

/** Todas as propostas do usuario, de todas as contas de anuncio dele. Cada proposta
 * carrega o nome da conta a que pertence, ja que o board mistura contas diferentes. */
export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const proposals = await prisma.proposal.findMany({
    where: { credential: { providerConnection: { userId } } },
    orderBy: { createdAt: "desc" },
    include: {
      executions: { orderBy: { executedAt: "desc" }, take: 1 },
      abTest: true,
      credential: { select: { id: true, label: true, externalAccountId: true } },
    },
  });

  const proposalViews = proposals.map((proposal) => ({
    ...toProposalView(proposal),
    account: {
      id: proposal.credential.id,
      name: proposal.credential.label ?? proposal.credential.externalAccountId,
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Propostas"
        description="Toda ação que a JAMILE recomenda vira uma proposta aqui, de todas as suas contas — nada é executado sem sua aprovação."
      />
      <ProposalsBoard proposals={proposalViews} />
    </div>
  );
}
