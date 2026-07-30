import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProposalsBoard } from "@/components/proposals-board";
import { PageHeader } from "@/components/page-header";
import { toProposalView } from "@/lib/proposals/view";

/**
 * Versao cross-marca de brands/[brandSlug]/proposals/page.tsx - mesma query, so sem
 * filtrar por uma marca so (usa a lista de marcas do usuario, mesmo padrao ja usado
 * em layout.tsx/notifications.ts) e anexando o brand em cada proposta (ProposalsBoard
 * aceita brand por item desde essa mudanca) pra dar pra saber de qual marca e cada
 * uma quando misturadas.
 */
export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const brands = await prisma.brand.findMany({
    where: { brandAccess: { some: { userId } } },
    orderBy: { priorityOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      proposals: {
        orderBy: { createdAt: "desc" },
        include: { executions: { orderBy: { executedAt: "desc" }, take: 1 }, abTest: true },
      },
    },
  });

  const proposalViews = brands
    .flatMap((brand) =>
      brand.proposals.map((proposal) => ({
        ...toProposalView(proposal),
        brand: { id: brand.id, name: brand.name, slug: brand.slug },
      }))
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Propostas"
        description="Toda ação que a JAMILE recomenda vira uma proposta aqui, de todas as suas marcas — nada é executado sem sua aprovação."
      />
      <ProposalsBoard proposals={proposalViews} />
    </div>
  );
}
