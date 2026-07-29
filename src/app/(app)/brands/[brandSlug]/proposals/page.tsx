import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { type ProposalView, type ProposalAbTestView } from "@/components/proposal-card";
import { ProposalsBoard } from "@/components/proposals-board";
import { PageHeader } from "@/components/page-header";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

function toProposalView(proposal: {
  id: string;
  type: string;
  status: string;
  title: string;
  reason: string;
  metricsJson: unknown;
  suggestedAction: string;
  risk: string;
  rollbackPlan: string;
  platform: string | null;
  platformCampaignId: string | null;
  platformAdId: string | null;
  decisionNote: string | null;
  createdAt: Date;
  executions: { errorMessage: string | null }[];
  abTest: {
    status: string;
    controlValue: unknown;
    variantValue: unknown;
    endsAt: Date;
    winner: string | null;
    resultSummary: unknown;
  } | null;
}): ProposalView {
  return {
    ...proposal,
    metricsJson: (proposal.metricsJson as Record<string, unknown>) ?? {},
    createdAt: proposal.createdAt.toISOString(),
    lastExecutionError: proposal.executions[0]?.errorMessage ?? null,
    abTest: proposal.abTest
      ? {
          status: proposal.abTest.status,
          controlValue: Number(proposal.abTest.controlValue),
          variantValue: Number(proposal.abTest.variantValue),
          endsAt: proposal.abTest.endsAt.toISOString(),
          winner: proposal.abTest.winner,
          resultSummary: (proposal.abTest.resultSummary as ProposalAbTestView["resultSummary"]) ?? null,
        }
      : null,
  };
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
