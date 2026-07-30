"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CircleDot,
  FlaskConical,
  MessageSquare,
  Pause,
  Play,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { proposalStatusTone } from "@/lib/proposals/status";
import { BrandAvatar } from "@/components/brand-avatar";
import { IconBadge, type IconBadgeColor } from "@/components/icon-badge";
import { StatusBadge } from "@/components/status-badge";
import type { CampaignPlan } from "@/lib/agent/schema";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export const TYPE_LABEL: Record<string, string> = {
  NEW_CAMPAIGN: "Nova campanha",
  PAUSE_AD: "Pausar anúncio",
  ACTIVATE_AD: "Ativar anúncio",
  ADJUST_BUDGET: "Ajustar verba",
  CREATE_AD_VARIATION: "Variação de criativo",
  CREATE_AB_TEST: "Teste A/B",
  OTHER: "Outra ação",
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PAUSE_AD: Pause,
  ACTIVATE_AD: Play,
  ADJUST_BUDGET: TrendingUp,
  CREATE_AD_VARIATION: Sparkles,
  CREATE_AB_TEST: FlaskConical,
};

const TYPE_COLOR: Record<string, IconBadgeColor> = {
  PAUSE_AD: "rose",
  ACTIVATE_AD: "green",
  ADJUST_BUDGET: "blue",
  CREATE_AD_VARIATION: "violet",
  CREATE_AB_TEST: "cyan",
};

const METRIC_LABEL: Record<string, string> = {
  spend: "Investimento",
  ctr: "CTR",
  cpc: "CPC",
  cpl: "CPL",
  cpa: "CPA",
  conversions: "Conversões",
  impressions: "Impressões",
  clicks: "Cliques",
  currentBudget: "Verba atual",
  proposedBudget: "Verba proposta",
};

const CURRENCY_METRIC_KEYS = new Set(["spend", "cpc", "cpl", "cpa", "currentBudget", "proposedBudget"]);
const PERCENT_METRIC_KEYS = new Set(["ctr"]);

function formatMetricValue(key: string, value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  if (CURRENCY_METRIC_KEYS.has(key)) return formatCurrency(num);
  if (PERCENT_METRIC_KEYS.has(key)) return `${num.toFixed(2)}%`;
  return num.toLocaleString("pt-BR");
}

/** Resumo legivel do plano estruturado (payloadJson.campaignPlan) - so existe quando type=NEW_CAMPAIGN. */
function CampaignPlanSummary({ plan, platform }: { plan: CampaignPlan; platform: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{plan.campaignName}</span>
        <span className="font-semibold">{formatCurrency(plan.dailyBudget)}/dia</span>
      </div>
      {platform === "GOOGLE" && plan.googleAd ? (
        <>
          <p>
            <span className="font-medium">Headlines: </span>
            {plan.googleAd.headlines.join(" · ")}
          </p>
          <p>
            <span className="font-medium">Descriptions: </span>
            {plan.googleAd.descriptions.join(" · ")}
          </p>
          {plan.googleKeywords ? (
            <p>
              <span className="font-medium">Palavras-chave: </span>
              {plan.googleKeywords.map((k) => `${k.text} (${k.matchType})`).join(", ")}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p>
            <span className="font-medium">{plan.headline}</span> — {plan.primaryText}
          </p>
          {plan.metaTargeting ? (
            <p className="text-muted-foreground">
              {plan.metaTargeting.countries.join(", ")} · {plan.metaTargeting.ageMin}-{plan.metaTargeting.ageMax}{" "}
              anos · interesses: {plan.metaTargeting.interests.join(", ")}
            </p>
          ) : null}
        </>
      )}
      <p className="truncate text-muted-foreground">{plan.finalUrl}</p>
    </div>
  );
}

export interface ProposalAbTestView {
  status: string;
  controlValue: number;
  variantValue: number;
  endsAt: string;
  winner: string | null;
  resultSummary: {
    control: { spend: number; conversions: number; cpl: number | null };
    variant: { spend: number; conversions: number; cpl: number | null };
  } | null;
}

export interface ProposalView {
  id: string;
  type: string;
  status: string;
  title: string;
  reason: string;
  metricsJson: Record<string, unknown>;
  suggestedAction: string;
  risk: string;
  rollbackPlan: string;
  platform: string | null;
  platformCampaignId: string | null;
  platformAdId: string | null;
  decisionNote: string | null;
  createdAt: string;
  /** Erro da ultima tentativa de execucao, se status===EXECUTION_FAILED. */
  lastExecutionError?: string | null;
  /** Presente quando essa proposta gerou um teste A/B real em execucao/concluido. */
  abTest?: ProposalAbTestView | null;
  /** So relevante para type=NEW_CAMPAIGN - nunca manda os bytes da imagem, so se ja tem uma. */
  hasCreativeAsset?: boolean;
  /** Plano estruturado da campanha nova (payloadJson.campaignPlan) - so quando type=NEW_CAMPAIGN. */
  campaignPlan?: CampaignPlan | null;
}

export interface ProposalBrandView {
  id: string;
  name: string;
  slug: string;
}

/**
 * Card SÓ LEITURA - histórico/auditoria de uma proposta. Aprovar/rejeitar/ajustar/
 * executar não acontece mais por aqui: toda a árvore de decisão passa a acontecer
 * conversando com a JAMILE (confirm_and_execute_action/resolve_proposal/
 * adjust_proposal, ver lib/agent/tools/index.ts) - decisão do Renan, ver plano
 * "JAMILE conduz tudo pelo chat". Anexar a imagem de uma NEW_CAMPAIGN também migrou pro chat
 * (ChatCreativeAssetUpload em chat-panel.tsx).
 */
export function ProposalCard({ proposal, brand }: { proposal: ProposalView; brand?: ProposalBrandView }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isNeedsData = proposal.status === "NEEDS_MORE_DATA";
  const isExecutionFailed = proposal.status === "EXECUTION_FAILED";
  // Mesma regra do backend (deleteProposal.ts): so essas duas garantem que existe
  // ExecutionLog - apagar deletaria historico de uma acao real na plataforma.
  const isExecuted = proposal.status === "EXECUTED" || isExecutionFailed;

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao excluir proposta.");
        return;
      }
      toast.success("Proposta excluída.");
      router.refresh();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {brand ? (
            <Link
              href={`/brands/${brand.slug}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <BrandAvatar name={brand.name} seed={brand.id} size="xs" />
              {brand.name}
            </Link>
          ) : null}
          <div className="flex items-center gap-2">
            <IconBadge icon={TYPE_ICON[proposal.type] ?? CircleDot} color={TYPE_COLOR[proposal.type] ?? "blue"} size="sm" />
            <div className="flex min-w-0 flex-col">
              <CardTitle className="truncate text-base">{proposal.title}</CardTitle>
              <span className="text-xs text-muted-foreground">{TYPE_LABEL[proposal.type] ?? proposal.type}</span>
            </div>
          </div>
        </div>
        <StatusBadge
          tone={proposalStatusTone(proposal.status).tone}
          label={proposalStatusTone(proposal.status).label}
          className="shrink-0"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm">{proposal.reason}</p>
          </div>
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm">
              <span className="font-medium">Ação sugerida: </span>
              {proposal.suggestedAction}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-muted-foreground">{proposal.risk}</p>
          </div>
          <div className="flex items-start gap-2">
            <Undo2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{proposal.rollbackPlan}</p>
          </div>
        </div>

        {Object.keys(proposal.metricsJson).length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {Object.entries(proposal.metricsJson).map(([key, value]) => (
              <div key={key} className="flex flex-col rounded-lg border bg-muted/40 px-2.5 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {METRIC_LABEL[key] ?? key}
                </span>
                <span className="text-sm font-semibold">{formatMetricValue(key, value)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {proposal.abTest ? (
          <div className="rounded-lg border bg-cyan-500/5 p-3">
            <p className="text-sm font-medium">
              {proposal.abTest.status === "RUNNING"
                ? `Teste A/B em andamento até ${formatDate(new Date(proposal.abTest.endsAt))}`
                : `Teste A/B concluído — ${
                    proposal.abTest.winner === "VARIANT"
                      ? "variante venceu"
                      : proposal.abTest.winner === "CONTROL"
                        ? "controle venceu"
                        : "inconclusivo"
                  }`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="flex flex-col rounded-lg border bg-background px-2.5 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Controle</span>
                <span className="text-sm font-semibold">{formatCurrency(proposal.abTest.controlValue)}/dia</span>
                {proposal.abTest.resultSummary ? (
                  <span className="text-xs text-muted-foreground">
                    CPL{" "}
                    {proposal.abTest.resultSummary.control.cpl !== null
                      ? formatCurrency(proposal.abTest.resultSummary.control.cpl)
                      : "n/d"}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col rounded-lg border bg-background px-2.5 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Variante</span>
                <span className="text-sm font-semibold">{formatCurrency(proposal.abTest.variantValue)}/dia</span>
                {proposal.abTest.resultSummary ? (
                  <span className="text-xs text-muted-foreground">
                    CPL{" "}
                    {proposal.abTest.resultSummary.variant.cpl !== null
                      ? formatCurrency(proposal.abTest.resultSummary.variant.cpl)
                      : "n/d"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {proposal.campaignPlan ? (
          <CampaignPlanSummary plan={proposal.campaignPlan} platform={proposal.platform} />
        ) : null}

        {isNeedsData ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {proposal.type === "NEW_CAMPAIGN"
              ? "Falta anexar a imagem do anúncio — peça pra JAMILE no chat, ela mostra onde anexar."
              : "Aguardando um campaign_id/ad_id e métrica financeira reais antes de poder ir para aprovação."}
          </p>
        ) : null}
        {isExecutionFailed && proposal.lastExecutionError ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="font-medium">Falha na última execução: </span>
            {proposal.lastExecutionError}
          </p>
        ) : null}
        {proposal.decisionNote ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Nota da decisão: </span>
            {proposal.decisionNote}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            Criada em {formatDateTime(new Date(proposal.createdAt))}
          </span>
          {!isExecuted ? (
            confirmingDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Excluir de vez?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs"
                  disabled={isDeleting}
                  onClick={handleDelete}
                >
                  Confirmar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs"
                  disabled={isDeleting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmingDelete(true)}
                title="Excluir proposta"
                aria-label="Excluir proposta"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
