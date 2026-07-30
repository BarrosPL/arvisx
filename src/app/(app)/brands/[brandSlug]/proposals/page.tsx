import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProposalsBoard } from "@/components/proposals-board";
import { PageHeader } from "@/components/page-header";
import { toProposalView } from "@/lib/proposals/view";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export default async function BrandProposalsPage({ params }: PageProps) {
  const { brandSlug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    notFound();
  }

  const access = await prisma.brandAccess.findUnique({
    where: { userId_brandId: { userId: session.user.id, brandId: brand.id } },
  });
  if (!access) {
    notFound();
  }

  const proposals = await prisma.proposal.findMany({
    where: { brandId: brand.id },
    orderBy: { createdAt: "desc" },
    include: { executions: { orderBy: { executedAt: "desc" }, take: 1 }, abTest: true },
  });

  const proposalViews = proposals.map(toProposalView);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Propostas"
        description="Toda ação que a JAMILE recomenda vira uma proposta aqui — nada é executado sem sua aprovação."
      />
      <ProposalsBoard proposals={proposalViews} />
    </div>
  );
}
