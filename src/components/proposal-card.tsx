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
  TrendingUp,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { proposalStatusTone } from "@/lib/proposals/status";
import { BrandAvatar } from "@/components/brand-avatar";
import { IconBadge, type IconBadgeColor } from "@/components/icon-badge";
import { StatusBadge } from "@/components/status-badge";

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

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "EUR" });
}

function formatMetricValue(key: string, value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  if (CURRENCY_METRIC_KEYS.has(key)) return formatCurrency(num);
  if (PERCENT_METRIC_KEYS.has(key)) return `${num.toFixed(2)}%`;
  return num.toLocaleString("pt-BR");
}

/** Resumo do que a execucao real vai fazer, mostrado no dialogo de confirmacao antes de chamar a API. */
function describeExecution(proposal: ProposalView): string {
  if (proposal.type === "ADJUST_BUDGET") {
    const current = proposal.metricsJson.currentBudget;
    const proposed = proposal.metricsJson.proposedBudget;
    if (typeof current === "number" && typeof proposed === "number") {
      return `Vai mudar a verba diária de ${formatCurrency(current)} para ${formatCurrency(proposed)}.`;
    }
    return "Vai mudar a verba diária desta campanha/anúncio.";
  }
  if (proposal.type === "PAUSE_AD") return "Vai pausar este anúncio na plataforma.";
  if (proposal.type === "ACTIVATE_AD") return "Vai ativar este anúncio na plataforma.";
  if (proposal.type === "CREATE_AB_TEST") {
    if (proposal.platform !== "META") {
      return "Teste A/B com execução real ainda só é suportado no Meta Ads.";
    }
    const current = proposal.metricsJson.currentBudget;
    const proposed = proposal.metricsJson.proposedBudget;
    const budgetText =
      typeof current === "number" && typeof proposed === "number"
        ? `com verba de ${formatCurrency(proposed)}/dia (original: ${formatCurrency(current)}/dia)`
        : "com uma verba diferente";
    return `Vai criar uma CÓPIA real deste anúncio ${budgetText}, reaproveitando a mesma imagem/texto, e rodar os dois em paralelo por 7 dias. Ao final, o sistema compara os resultados reais e recomenda um vencedor.`;
  }
  return "Vai executar esta ação na plataforma.";
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
}

type DecisionAction = "approve" | "reject" | "test" | "adjust" | "reopen";

const ACTION_LABEL: Record<DecisionAction, string> = {
  approve: "Aprovar",
  reject: "Rejeitar",
  test: "Testar",
  adjust: "Ajustar",
  reopen: "Reabrir",
};

const ACTION_PAST_LABEL: Record<DecisionAction, string> = {
  approve: "aprovada",
  reject: "rejeitada",
  test: "marcada para teste",
  adjust: "marcada para ajuste",
  reopen: "reaberta",
};

function NoteDialog({
  action,
  onConfirm,
  disabled,
}: {
  action: DecisionAction;
  onConfirm: (note: string) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={action === "reject" ? "destructive" : "outline"} size="sm" />} disabled={disabled}>
        {ACTION_LABEL[action]}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ACTION_LABEL[action]} proposta</DialogTitle>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Motivo (obrigatório)"
        />
        <DialogFooter>
          <Button
            variant={action === "reject" ? "destructive" : "default"}
            disabled={!note.trim() || isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                await onConfirm(note.trim());
                setOpen(false);
                setNote("");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExecuteDialog({
  proposal,
  onConfirm,
  disabled,
}: {
  proposal: ProposalView;
  onConfirm: () => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" className="rounded-full" />} disabled={disabled}>
        Executar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar execução</DialogTitle>
        </DialogHeader>
        <p className="text-sm">{describeExecution(proposal)}</p>
        <p className="text-xs text-muted-foreground">
          Isso muda a campanha de verdade na plataforma - não é revertido automaticamente.
        </p>
        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            Sim, executar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAdjustDialog({
  proposal,
  onConfirm,
  disabled,
}: {
  proposal: ProposalView;
  onConfirm: (fields: { title: string; suggestedAction: string; proposedBudget?: number }) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [suggestedAction, setSuggestedAction] = useState(proposal.suggestedAction);
  const hasBudget = typeof proposal.metricsJson.proposedBudget === "number";
  const [proposedBudget, setProposedBudget] = useState(
    hasBudget ? String(proposal.metricsJson.proposedBudget) : ""
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="rounded-full" />} disabled={disabled}>
        Editar e reabrir
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar proposta</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Título</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Ação sugerida</label>
          <Textarea value={suggestedAction} onChange={(event) => setSuggestedAction(event.target.value)} />
        </div>
        {hasBudget ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Verba proposta (€/dia)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={proposedBudget}
              onChange={(event) => setProposedBudget(event.target.value)}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={isSubmitting || !title.trim() || !suggestedAction.trim()}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                const budgetValue = hasBudget ? Number(proposedBudget) : undefined;
                await onConfirm({
                  title: title.trim(),
                  suggestedAction: suggestedAction.trim(),
                  proposedBudget: budgetValue !== undefined && Number.isFinite(budgetValue) ? budgetValue : undefined,
                });
                setOpen(false);
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            Salvar e reabrir para decisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ProposalBrandView {
  id: string;
  name: string;
  slug: string;
}

export function ProposalCard({ proposal, brand }: { proposal: ProposalView; brand?: ProposalBrandView }) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function decide(action: DecisionAction, note: string | null) {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note ?? undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao atualizar proposta.");
        return;
      }
      toast.success(`Proposta ${ACTION_PAST_LABEL[action]}.`);
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  async function editAndReopen(fields: { title: string; suggestedAction: string; proposedBudget?: number }) {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao editar proposta.");
        return;
      }
      toast.success("Proposta editada e reaberta.");
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  async function execute() {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/execute`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao executar proposta.");
        return;
      }
      toast.success("Executado com sucesso.");
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  }

  const isPending = proposal.status === "PENDING";
  const isNeedsData = proposal.status === "NEEDS_MORE_DATA";
  const isApproved = proposal.status === "APPROVED";
  const isTest = proposal.status === "TEST";
  const isAdjust = proposal.status === "ADJUST";
  const isExecutionFailed = proposal.status === "EXECUTION_FAILED";

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
                ? `Teste A/B em andamento até ${new Date(proposal.abTest.endsAt).toLocaleDateString("pt-BR")}`
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

        {isNeedsData ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Aguardando um campaign_id/ad_id e métrica financeira reais antes de poder ir para aprovação.
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
            Criada em {new Date(proposal.createdAt).toLocaleString("pt-BR")}
          </span>
          {isPending ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                className="rounded-full"
                disabled={isBusy}
                onClick={() => decide("approve", null)}
              >
                Aprovar
              </Button>
              <NoteDialog action="test" onConfirm={(note) => decide("test", note)} disabled={isBusy} />
              <NoteDialog action="adjust" onConfirm={(note) => decide("adjust", note)} disabled={isBusy} />
              <NoteDialog action="reject" onConfirm={(note) => decide("reject", note)} disabled={isBusy} />
            </div>
          ) : null}
          {isApproved || isTest ? <ExecuteDialog proposal={proposal} onConfirm={execute} disabled={isBusy} /> : null}
          {isExecutionFailed ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={isBusy}
              onClick={() => decide("approve", null)}
            >
              Tentar novamente
            </Button>
          ) : null}
          {isAdjust ? <EditAdjustDialog proposal={proposal} onConfirm={editAndReopen} disabled={isBusy} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
