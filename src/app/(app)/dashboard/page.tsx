import { Building2, Clock, Inbox, Sparkles, Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingGate } from "@/components/onboarding-gate";
import { isMetaOAuthConfigured, getMetaRedirectUri } from "@/lib/oauth/meta";
import { isGoogleOAuthConfigured, getGoogleRedirectUri } from "@/lib/oauth/google";
import { type ProposalAbTestView } from "@/components/proposal-card";
import { ProposalSummaryRow } from "@/components/proposal-summary-row";
import { BrandSummaryRow } from "@/components/brand-summary-row";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { AttentionItem } from "@/components/attention-item";
import { verdictTone } from "@/lib/ranking/verdictLabels";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/format";

function firstRecommendedReason(recommendedActionsJson: unknown): string | undefined {
  if (!Array.isArray(recommendedActionsJson) || recommendedActionsJson.length === 0) return undefined;
  const first = recommendedActionsJson[0];
  if (first && typeof first === "object" && "reason" in first) {
    const reason = (first as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : undefined;
  }
  return undefined;
}

interface AttentionEntry {
  key: string;
  tone: "danger" | "warning";
  title: string;
  description?: string;
  /** Abre o chat da JAMILE já perguntando sobre isso - não navega mais pra uma página. */
  prefill: string;
}

const MAX_ATTENTION_ITEMS = 6;

/** Frase narrada pelo topo do resumo da JAMILE - reorganizacao de apresentacao dos
 * mesmos dados ja calculados (verdict por marca), nao uma agregacao nova. */
function buildNarrativeSummary(
  verdicts: Array<"BOM" | "MEDIO" | "RUIM" | null>,
  totalSpend: number
): string {
  const counts = { bom: 0, medio: 0, ruim: 0, semDados: 0 };
  for (const verdict of verdicts) {
    if (verdict === "BOM") counts.bom++;
    else if (verdict === "MEDIO") counts.medio++;
    else if (verdict === "RUIM") counts.ruim++;
    else counts.semDados++;
  }
  const parts: string[] = [];
  if (counts.bom > 0) parts.push(`${counts.bom} indo bem`);
  if (counts.medio > 0) parts.push(`${counts.medio} estável(is)`);
  if (counts.ruim > 0) parts.push(`${counts.ruim} precisando de atenção`);
  if (counts.semDados > 0) parts.push(`${counts.semDados} sem dado suficiente ainda`);
  const statusSentence = parts.length > 0 ? parts.join(", ") : "nenhuma com dado suficiente ainda";
  return `Analisei suas ${verdicts.length} marca(s): ${statusSentence}. Investimento total: ${formatCurrency(totalSpend)}.`;
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
      include: { brandResults: { include: { brand: { select: { id: true, name: true, slug: true } } } } },
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
        },
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

  const attentionItems: AttentionEntry[] = [];

  for (const { brand, proposal } of allOpenProposals) {
    if (proposal.status === "EXECUTION_FAILED") {
      attentionItems.push({
        key: `exec-${proposal.id}`,
        tone: "danger",
        title: `Falha ao executar: ${proposal.title}`,
        description: proposal.lastExecutionError ? `${brand.name} · ${proposal.lastExecutionError}` : brand.name,
        prefill: `Por que a execução da proposta "${proposal.title}" (id: ${proposal.id}, marca: ${brand.name}) falhou?`,
      });
    }
  }
  if (latestRun) {
    for (const result of latestRun.brandResults) {
      if (result.outcome === "error") {
        attentionItems.push({
          key: `run-${result.id}`,
          tone: "danger",
          title: `Falha na última análise de ${result.brand.name}`,
          description: result.errorMessage ?? undefined,
          prefill: `Por que a última análise da marca ${result.brand.name} falhou?`,
        });
      }
    }
  }
  for (const { brand, proposal } of allOpenProposals) {
    if (proposal.status === "NEEDS_MORE_DATA") {
      attentionItems.push({
        key: `data-${proposal.id}`,
        tone: "warning",
        title: `Precisa de mais dados: ${proposal.title}`,
        description: brand.name,
        prefill: `Me explica a proposta "${proposal.title}" (id: ${proposal.id}, marca: ${brand.name}) que está aguardando dado.`,
      });
    }
  }
  for (const brand of brands) {
    const snapshot = brand.rankingSnapshots[0];
    if (snapshot?.verdict === "RUIM") {
      const reason = firstRecommendedReason(snapshot.recommendedActionsJson);
      attentionItems.push({
        key: `verdict-${brand.id}`,
        tone: "warning",
        title: `${brand.name} precisa de atenção`,
        description: reason ? `Diagnóstico: ${reason}` : undefined,
        prefill: `Por que a marca ${brand.name} está com diagnóstico ruim? O que você recomenda?`,
      });
    }
  }

  const visibleAttentionItems = attentionItems.slice(0, MAX_ATTENTION_ITEMS);
  const hiddenAttentionCount = attentionItems.length - visibleAttentionItems.length;

  const greetingName = session!.user.name ?? session!.user.email?.split("@")[0] ?? "";
  const narrativeSummary = buildNarrativeSummary(
    brands.map((brand) => brand.rankingSnapshots[0]?.verdict ?? null),
    totalSpend
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={greetingName ? `Olá, ${greetingName}` : "Visão geral"}
        description={
          runSummary
            ? `Última análise automática em ${formatDateTime(runSummary.startedAt)}`
            : "A primeira análise automática da JAMILE ainda vai rodar em instantes."
        }
        actions={<RunAnalysisButton />}
      />

      {runSummary ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge tone="success" label={`${runSummary.created} proposta(s) nova(s)`} />
          <StatusBadge tone="neutral" label={`${runSummary.noAction} marca(s) sem ação`} />
          {runSummary.errors > 0 ? (
            <StatusBadge tone="danger" label={`${runSummary.errors} erro(s) na coleta`} />
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Marcas ativas"
          value={activeBrandsCount}
          icon={Building2}
          context={`de ${brands.length} marca(s) no total`}
        />
        <StatCard
          label="Propostas pendentes"
          value={allOpenProposals.length}
          icon={Inbox}
          tone={allOpenProposals.length > 0 ? "warning" : "default"}
        />
        <StatCard label="Investimento total" value={formatCurrency(totalSpend)} icon={Wallet} />
        <StatCard
          label="Última análise"
          value={runSummary ? formatTime(runSummary.startedAt, { hour: "2-digit", minute: "2-digit" }) : "—"}
          icon={Clock}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Atenção necessária</h2>
        {visibleAttentionItems.length === 0 ? (
          <EmptyState
            title="Nada precisa da sua atenção agora"
            description="Sem falhas de execução, propostas travadas ou marcas em mau estado no momento."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visibleAttentionItems.map((item) => (
              <AttentionItem key={item.key} tone={item.tone} title={item.title} description={item.description} prefill={item.prefill} />
            ))}
            {hiddenAttentionCount > 0 ? (
              <span className="text-xs text-muted-foreground">e mais {hiddenAttentionCount} item(ns)</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">O que a JAMILE analisou</h2>
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="ai-gradient-bg flex size-8 shrink-0 items-center justify-center rounded-full text-white">
            <Sparkles className="size-4" />
          </div>
          <p className="text-sm leading-relaxed text-pretty">{narrativeSummary}</p>
        </div>
        <div className="flex flex-col gap-2">
          {brands.map((brand) => {
            const ranking = brand.rankingSnapshots[0];
            const verdict = ranking ? verdictTone(ranking.verdict) : null;
            return (
              <BrandSummaryRow
                key={brand.id}
                brand={{
                  id: brand.id,
                  name: brand.name,
                  slug: brand.slug,
                  verdictLabel: verdict?.label ?? null,
                  verdictTone: verdict?.tone ?? "neutral",
                  spend: spendByBrandId.get(brand.id) ?? 0,
                  openProposalsCount: brand.proposals.length,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Propostas aguardando decisão ({allOpenProposals.length})
        </h2>
        {allOpenProposals.length === 0 ? (
          <EmptyState
            title="Nenhuma proposta pendente"
            description="Nenhuma marca tem proposta aberta no momento. Novas propostas aparecem aqui assim que a JAMILE encontrar uma oportunidade ou risco."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {allOpenProposals.map(({ brand, proposal }) => (
              <ProposalSummaryRow key={proposal.id} proposal={proposal} brand={brand} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
