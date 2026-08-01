import { Clock, Inbox, Megaphone, Sparkles, Target, Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingGate } from "@/components/onboarding-gate";
import { isMetaOAuthConfigured, getMetaRedirectUri } from "@/lib/oauth/meta";
import { isGoogleOAuthConfigured, getGoogleRedirectUri } from "@/lib/oauth/google";
import { ActiveCampaignsTable, type ActiveCampaignRow } from "@/components/active-campaigns-table";
import { CollectionStatusNotice, type CollectionFailure } from "@/components/collection-status-notice";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { RefreshDataButton } from "@/components/refresh-data-button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/lifecycle";

const ACTIVE_STATUSES = new Set(["ACTIVE", "ENABLED"]);

function buildNarrativeSummary(activeCount: number, totalSpend: number, totalResults: number): string {
  if (activeCount === 0) {
    return "Nenhuma campanha veiculando no momento nas contas conectadas.";
  }
  const resultPart =
    totalResults > 0 ? `${formatNumber(totalResults)} resultado(s)` : "nenhum resultado registrado ainda";
  return `Você tem ${activeCount} campanha(s) ativa(s), com ${formatCurrency(totalSpend)} investido(s) e ${resultPart} nos últimos 7 dias.`;
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

  // Tudo pendura direto na conta de anuncio agora - nao ha mais uma camada de "marca"
  // no meio exigindo atribuicao manual pro dado aparecer aqui.
  const [accounts, latestRun, campaignSnapshots, openProposalsCount] = await Promise.all([
    prisma.adCredential.findMany({
      where: { providerConnection: { userId } },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, externalAccountId: true },
    }),
    prisma.schedulerRun.findFirst({
      orderBy: { startedAt: "desc" },
      include: { accountResults: true },
    }),
    // Mesma dedupe ja usada em todo lugar que le snapshot (orderBy collectedAt desc +
    // distinct): so a coleta MAIS RECENTE de cada campanha. Sem filtro de
    // collectionState - as linhas de erro precisam vir junto pra dar pra dizer POR QUE
    // a tela esta vazia (antes um erro de coleta virava zero silencioso).
    prisma.campaignMetricSnapshot.findMany({
      where: { credential: { providerConnection: { userId } } },
      orderBy: { collectedAt: "desc" },
      distinct: ["credentialId", "platformCampaignId"],
    }),
    prisma.proposal.count({
      where: {
        createdByUserId: null,
        status: { in: OPEN_PROPOSAL_STATUSES },
        credential: { providerConnection: { userId } },
      },
    }),
  ]);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountName = (id: string) => {
    const account = accountById.get(id);
    return account ? (account.label ?? account.externalAccountId) : "Conta desconhecida";
  };

  const okSnapshots = campaignSnapshots.filter((snapshot) => snapshot.collectionState === "OK");
  const failedSnapshots = campaignSnapshots.filter(
    (snapshot) => snapshot.collectionState === "AUTH_ERROR" || snapshot.collectionState === "API_ERROR"
  );
  const neverCollected = campaignSnapshots.length === 0;

  const activeRows: ActiveCampaignRow[] = okSnapshots
    .filter(
      (snapshot) =>
        snapshot.platformCampaignId && ACTIVE_STATUSES.has((snapshot.campaignStatus ?? "").toUpperCase())
    )
    .map((snapshot) => ({
      key: snapshot.id,
      accountName: accountName(snapshot.credentialId),
      platform: snapshot.platform,
      campaignName: snapshot.campaignName ?? "Campanha sem nome",
      campaignStatus: snapshot.campaignStatus,
      results: snapshot.results,
      resultType: snapshot.resultType,
      cpr: snapshot.cpr !== null ? Number(snapshot.cpr) : null,
      spend: Number(snapshot.spend),
      impressions: snapshot.impressions,
      reach: snapshot.reach,
      cpm: snapshot.cpm !== null ? Number(snapshot.cpm) : null,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Somas só sobre o que É somável. CPR do topo é recalculado do total (soma do gasto
  // ÷ soma dos resultados), nunca a média dos CPRs - média de média dá número errado.
  const totalSpend = activeRows.reduce((sum, row) => sum + row.spend, 0);
  const totalResults = activeRows.reduce((sum, row) => sum + row.results, 0);
  const averageCpr = totalResults > 0 ? totalSpend / totalResults : null;

  const lastCollectedAt = campaignSnapshots.reduce<Date | null>(
    (latest, snapshot) => (latest === null || snapshot.collectedAt > latest ? snapshot.collectedAt : latest),
    null
  );

  const collectionFailures: CollectionFailure[] = failedSnapshots.map((snapshot) => ({
    accountName: accountName(snapshot.credentialId),
    platform: snapshot.platform,
    errorMessage: snapshot.errorMessage,
  }));

  const runSummary = latestRun
    ? (() => {
        const created = latestRun.accountResults.filter((r) => r.outcome === "proposal_created").length;
        const noAction = latestRun.accountResults.filter((r) => r.outcome === "no_action").length;
        const errors = latestRun.accountResults.filter((r) => r.outcome === "error").length;
        return { startedAt: latestRun.startedAt, created, noAction, errors };
      })()
    : null;

  const greetingName = session!.user.name ?? session!.user.email?.split("@")[0] ?? "";
  const narrativeSummary = buildNarrativeSummary(activeRows.length, totalSpend, totalResults);

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
          <StatusBadge tone="neutral" label={`${runSummary.noAction} conta(s) sem ação`} />
          {runSummary.errors > 0 ? (
            <StatusBadge tone="danger" label={`${runSummary.errors} erro(s) na coleta`} />
          ) : null}
        </div>
      ) : null}

      <CollectionStatusNotice neverCollected={neverCollected} failures={collectionFailures} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Campanhas ativas"
          value={activeRows.length}
          icon={Megaphone}
          context={`em ${accounts.length} conta(s)`}
        />
        <StatCard label="Investimento" value={formatCurrency(totalSpend)} icon={Wallet} context="últimos 7 dias" />
        <StatCard label="Resultados" value={formatNumber(totalResults)} icon={Target} context="últimos 7 dias" />
        <StatCard
          label="CPR médio"
          value={averageCpr !== null ? formatCurrency(averageCpr) : "—"}
          icon={Inbox}
          context={openProposalsCount > 0 ? `${openProposalsCount} proposta(s) pendente(s)` : undefined}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">O que a JAMILE analisou</h2>
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="ai-gradient-bg flex size-8 shrink-0 items-center justify-center rounded-full text-white">
            <Sparkles className="size-4" />
          </div>
          <p className="text-sm leading-relaxed text-pretty">{narrativeSummary}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Campanhas ativas ({activeRows.length})</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>
              {lastCollectedAt ? `Atualizado ${formatRelativeTime(lastCollectedAt)}` : "Ainda não coletado"}
            </span>
            <RefreshDataButton />
          </div>
        </div>
        <ActiveCampaignsTable rows={activeRows} />
      </div>
    </div>
  );
}
