import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrandAvatar } from "@/components/brand-avatar";
import { OnboardingGate } from "@/components/onboarding-gate";
import { isMetaOAuthConfigured, getMetaRedirectUri } from "@/lib/oauth/meta";
import { isGoogleOAuthConfigured, getGoogleRedirectUri } from "@/lib/oauth/google";
import { ProposalCard, type ProposalView, type ProposalAbTestView } from "@/components/proposal-card";
import { RunAnalysisButton } from "@/components/run-analysis-button";

const VERDICT_LABEL: Record<string, string> = {
  BOM: "Bom",
  MEDIO: "Estável",
  RUIM: "Precisa de ação",
};

const VERDICT_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  BOM: "default",
  MEDIO: "secondary",
  RUIM: "destructive",
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "EUR" });
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const connectionsCount = await prisma.providerConnection.count({ where: { userId } });

  if (connectionsCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <OnboardingGate
          metaConfigured={isMetaOAuthConfigured()}
          googleConfigured={isGoogleOAuthConfigured()}
          metaRedirectUri={getMetaRedirectUri()}
          googleRedirectUri={getGoogleRedirectUri()}
        />
      </div>
    );
  }

  const [brands, latestRun, spendByBrand] = await Promise.all([
    prisma.brand.findMany({
      where: { brandAccess: { some: { userId } } },
      orderBy: { priorityOrder: "asc" },
      include: {
        rankingSnapshots: { orderBy: { computedAt: "desc" }, take: 1 },
        proposals: {
          where: { status: { in: ["PENDING", "NEEDS_MORE_DATA", "APPROVED", "TEST", "ADJUST", "EXECUTION_FAILED"] } },
          orderBy: { createdAt: "desc" },
          include: { executions: { orderBy: { executedAt: "desc" }, take: 1 }, abTest: true },
        },
      },
    }),
    prisma.schedulerRun.findFirst({
      orderBy: { startedAt: "desc" },
      include: { brandResults: true },
    }),
    // groupBy+_sum somaria toda a serie historica (AdMetricSnapshot acumula uma linha
    // por coleta desde que paramos de apagar - lib/ads/collect.ts). Por isso busca so
    // a coleta mais recente por (credencial, anuncio) e soma em memoria, igual ao
    // mesmo padrao ja usado em lib/ranking/compute.ts e agent/tools/getMetrics.ts.
    prisma.adMetricSnapshot.findMany({
      where: { collectionState: "OK" },
      orderBy: { collectedAt: "desc" },
      distinct: ["credentialId", "platformAdId"],
      select: { brandId: true, spend: true },
    }),
  ]);

  const spendByBrandId = new Map<string, number>();
  for (const snapshot of spendByBrand) {
    spendByBrandId.set(snapshot.brandId, (spendByBrandId.get(snapshot.brandId) ?? 0) + Number(snapshot.spend));
  }

  const allOpenProposals = brands
    .flatMap((brand) =>
      brand.proposals.map((proposal) => ({
        brand: { id: brand.id, name: brand.name, slug: brand.slug },
        proposal: {
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
        } as ProposalView,
      }))
    )
    .sort((a, b) => (a.proposal.createdAt < b.proposal.createdAt ? 1 : -1));

  const runSummary = latestRun
    ? (() => {
        const created = latestRun.brandResults.filter((r) => r.outcome === "proposal_created").length;
        const noAction = latestRun.brandResults.filter((r) => r.outcome === "no_action").length;
        const errors = latestRun.brandResults.filter((r) => r.outcome === "error").length;
        return { startedAt: latestRun.startedAt, created, noAction, errors, status: latestRun.status };
      })()
    : null;

  const totalSpend = Array.from(spendByBrandId.values()).reduce((sum, value) => sum + value, 0);
  const activeBrandsCount = brands.filter((brand) => brand.status === "ACTIVE").length;

  const statTiles = [
    { label: "Marcas ativas", value: String(activeBrandsCount) },
    { label: "Propostas pendentes", value: String(allOpenProposals.length) },
    { label: "Investimento total", value: currency(totalSpend) },
    {
      label: "Última análise",
      value: runSummary ? runSummary.startedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            {runSummary
              ? `Última análise automática: ${runSummary.startedAt.toLocaleString("pt-BR")} · ${runSummary.created} proposta(s) nova(s) · ${runSummary.noAction} marca(s) sem ação${runSummary.errors > 0 ? ` · ${runSummary.errors} erro(s)` : ""}`
              : "A primeira análise automática da JAMILE ainda vai rodar em instantes."}
          </p>
        </div>
        <RunAnalysisButton />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statTiles.map((tile) => (
          <Card key={tile.label} className="shadow-sm">
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</span>
              <span className="text-2xl font-semibold tracking-tight">{tile.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => {
          const ranking = brand.rankingSnapshots[0];
          const spend = spendByBrandId.get(brand.id) ?? 0;
          return (
            <Link key={brand.id} href={`/brands/${brand.slug}`} className="group">
              <Card className="h-full shadow-sm transition-colors group-hover:border-foreground/20">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <BrandAvatar name={brand.name} seed={brand.id} size="sm" />
                    <CardTitle className="text-base">{brand.name}</CardTitle>
                  </div>
                  {ranking ? (
                    <Badge variant={VERDICT_VARIANT[ranking.verdict] ?? "outline"}>
                      {VERDICT_LABEL[ranking.verdict] ?? ranking.verdict}
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{spend > 0 ? `${currency(spend)} investidos` : "sem dados coletados"}</span>
                  <span>
                    {brand.proposals.length > 0
                      ? `${brand.proposals.length} proposta(s) aberta(s)`
                      : "sem proposta pendente"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Propostas aguardando decisão ({allOpenProposals.length})
        </h2>
        {allOpenProposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma proposta pendente em nenhuma marca no momento.</p>
        ) : (
          allOpenProposals.map(({ brand, proposal }) => (
            <ProposalCard key={proposal.id} proposal={proposal} brand={brand} />
          ))
        )}
      </div>
    </div>
  );
}
