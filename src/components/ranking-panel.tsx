"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNNEL_LABEL, FUNNEL_CLASSNAME } from "@/lib/ranking/funnelLabels";
import { StatusBadge } from "@/components/status-badge";
import { verdictTone } from "@/lib/ranking/verdictLabels";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/format";

type Verdict = "BOM" | "MEDIO" | "RUIM";

export interface RecommendedActionView {
  verdict: Verdict;
  reason: string;
  suggestedAction: string;
  risk: string;
  rollback: string;
  row: {
    platform: "META" | "GOOGLE";
    platformAdId: string | null;
    platformCampaignId: string | null;
    adName: string | null;
    campaignName: string | null;
    spend: number;
    ctr: number;
    cpc: number;
    conversions: number;
    cpl: number | null;
    cpa: number | null;
    funnelStage: "TOPO" | "MEIO" | "FUNDO" | null;
  };
}

export interface RankingView {
  verdict: Verdict;
  computedAt: string;
  recommendedActions: RecommendedActionView[];
}

const VERDICT_BORDER: Record<Verdict, string> = {
  BOM: "border-l-4 border-l-success",
  MEDIO: "border-l-4 border-l-border",
  RUIM: "border-l-4 border-l-destructive",
};

export function RankingPanel({ brandId, initial }: { brandId: string; initial: RankingView | null }) {
  const router = useRouter();
  const [ranking, setRanking] = useState(initial);
  const [isRecomputing, setIsRecomputing] = useState(false);

  async function handleRecompute() {
    setIsRecomputing(true);
    try {
      const response = await fetch(`/api/brands/${brandId}/ranking/recompute`, { method: "POST" });
      if (response.ok) {
        const body = await response.json();
        setRanking(body.ranking);
        router.refresh();
      }
    } finally {
      setIsRecomputing(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Diagnóstico de tráfego</CardTitle>
          {ranking ? (
            <StatusBadge tone={verdictTone(ranking.verdict).tone} label={verdictTone(ranking.verdict).label} />
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={handleRecompute} disabled={isRecomputing}>
          <RefreshCw className={isRecomputing ? "animate-spin" : ""} />
          Recalcular
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!ranking ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há dados coletados. Conecte uma credencial e clique em &quot;Coletar&quot; na aba
            Credenciais, depois recalcule aqui.
          </p>
        ) : ranking.recommendedActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dados coletados, mas nenhuma ação prioritária identificada ainda. Continue observando.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {ranking.recommendedActions.map((action, index) => (
              <div key={index} className={cn("rounded-lg border bg-card p-3", VERDICT_BORDER[action.verdict])}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {action.row.adName ?? action.row.campaignName ?? "Anúncio sem nome"}
                    </span>
                    {action.row.funnelStage ? (
                      <Badge variant="outline" className={FUNNEL_CLASSNAME[action.row.funnelStage]}>
                        {FUNNEL_LABEL[action.row.funnelStage]}
                      </Badge>
                    ) : null}
                  </div>
                  <StatusBadge tone={verdictTone(action.verdict).tone} label={action.reason} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {action.row.platform} · investimento {formatCurrency(action.row.spend)} · CTR{" "}
                  {action.row.ctr.toFixed(2)}% · CPC {formatCurrency(action.row.cpc)} · conversões{" "}
                  {action.row.conversions}
                  {action.row.cpl !== null ? ` · CPL ${formatCurrency(action.row.cpl)}` : ""}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">O que fazer: </span>
                  {action.suggestedAction}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Risco: </span>
                  {action.risk}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Rollback: </span>
                  {action.rollback}
                </p>
              </div>
            ))}
          </div>
        )}
        {ranking ? (
          <p className="text-xs text-muted-foreground">
            Última análise: {formatDateTime(new Date(ranking.computedAt))}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
