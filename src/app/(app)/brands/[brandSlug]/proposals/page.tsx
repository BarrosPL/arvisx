import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProposalCard, type ProposalView, type ProposalAbTestView } from "@/components/proposal-card";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

const ACTIONABLE_STATUSES = new Set(["PENDING", "NEEDS_MORE_DATA", "APPROVED", "TEST", "ADJUST", "EXECUTION_FAILED"]);

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

  const awaitingDecision = proposals.filter((p) => ACTIONABLE_STATUSES.has(p.status));
  const history = proposals.filter((p) => !ACTIONABLE_STATUSES.has(p.status));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Fila de propostas</h2>
        <p className="text-sm text-muted-foreground">
          Toda ação que a JAMILE recomenda vira uma proposta aqui - nada é executado sem aprovação.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Aguardando decisão</h3>
        {awaitingDecision.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma proposta pendente no momento.</p>
        ) : (
          awaitingDecision.map((proposal) => <ProposalCard key={proposal.id} proposal={toProposalView(proposal)} />)
        )}
      </div>

      {history.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">Histórico</h3>
          {history.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={toProposalView(proposal)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
