"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FUNNEL_LABEL, FUNNEL_CLASSNAME } from "@/lib/ranking/funnelLabels";
import { adStatusStyle } from "@/lib/ads/statusStyle";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

type Platform = "META" | "GOOGLE";

export interface CredentialItem {
  id: string;
  platform: Platform;
  externalAccountId: string;
  loginCustomerId: string | null;
  label: string | null;
  status: "PENDING" | "CONNECTED" | "AUTH_ERROR" | "DISCONNECTED";
  lastCheckedAt: string | null;
  lastError: string | null;
  connectionLabel: string | null;
}

export interface AdRowView {
  platformAdId: string | null;
  adName: string | null;
  adStatus: string | null;
  campaignName: string | null;
  funnelStage: "TOPO" | "MEIO" | "FUNDO" | null;
  reach: number | null;
  impressions: number;
  frequency: number | null;
  cpm: number | null;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  conversions: number;
  cpl: number | null;
  cpa: number | null;
  collectedAt: string;
}

const STATUS_LABEL: Record<CredentialItem["status"], string> = {
  PENDING: "Pendente",
  CONNECTED: "Conectada",
  AUTH_ERROR: "Erro de autenticação",
  DISCONNECTED: "Desconectada",
};

const STATUS_TONE: Record<CredentialItem["status"], StatusTone> = {
  PENDING: "neutral",
  CONNECTED: "success",
  AUTH_ERROR: "danger",
  DISCONNECTED: "neutral",
};

const PLATFORM_LABEL: Record<Platform, string> = { META: "Meta Ads", GOOGLE: "Google Ads" };

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "EUR" });
}

function integer(value: number) {
  return value.toLocaleString("pt-BR");
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tracking-tight">{value}</span>
    </div>
  );
}

function AdCard({ ad }: { ad: AdRowView }) {
  const status = adStatusStyle(ad.adStatus);
  const costPerResult = ad.cpl !== null ? ad.cpl : ad.cpa;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ad.adName ?? "Sem nome"}</p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">{ad.campaignName ?? "—"}</span>
            {ad.funnelStage ? (
              <Badge variant="outline" className={`${FUNNEL_CLASSNAME[ad.funnelStage]} shrink-0`}>
                {FUNNEL_LABEL[ad.funnelStage]}
              </Badge>
            ) : null}
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 ${status.className}`}>
          {status.label}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <StatTile label="Investimento" value={currency(ad.spend)} />
        <StatTile label="CTR" value={`${ad.ctr.toFixed(2)}%`} />
        <StatTile label="CPC" value={currency(ad.cpc)} />
        <StatTile label="Conversões" value={String(ad.conversions)} />
        <StatTile label="CPL/CPA" value={costPerResult !== null ? currency(costPerResult) : "—"} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span>Alcance {ad.reach !== null ? integer(ad.reach) : "—"}</span>
        <span>Impressões {integer(ad.impressions)}</span>
        <span>Frequência {ad.frequency !== null ? ad.frequency.toFixed(2) : "—"}</span>
        <span>CPM {ad.cpm !== null ? currency(ad.cpm) : "—"}</span>
        <span>Cliques {integer(ad.clicks)}</span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Coletado em {new Date(ad.collectedAt).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function AdAccountAdsGrid({ ads }: { ads: AdRowView[] }) {
  if (ads.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        Nenhum anúncio sincronizado ainda para esta conta — assim que a primeira sincronização
        automática rodar, os anúncios aparecem aqui sozinhos.
      </p>
    );
  }

  const totalSpend = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const totalImpressions = ads.reduce((sum, ad) => sum + ad.impressions, 0);

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <p className="text-xs text-muted-foreground">
        Últimos 7 dias, mesma janela do Gerenciador de Anúncios · {ads.length} anúncio(s) · investimento
        total {currency(totalSpend)} · {integer(totalImpressions)} impressões — confira esses totais contra
        a plataforma para validar os dados.
      </p>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {ads.map((ad) => (
          <AdCard key={ad.platformAdId ?? `${ad.adName}-${ad.collectedAt}`} ad={ad} />
        ))}
      </div>
    </div>
  );
}

export function CredentialsManager({
  initialCredentials,
  adsByCredential,
}: {
  brandId: string;
  initialCredentials: CredentialItem[];
  adsByCredential: Record<string, AdRowView[]>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Contas atribuídas a esta marca</CardTitle>
          <Button variant="outline" size="sm" render={<Link href="/connections" />} nativeButton={false} className="shrink-0">
            Gerenciar em Conexões
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Os dados sincronizam sozinhos assim que você atribui uma conta em{" "}
            <Link href="/connections" className="underline">
              Conexões
            </Link>
            , e continuam atualizando automaticamente a cada rodada de análise — não precisa coletar
            nada manualmente aqui. Pra forçar uma atualização imediata de todas as marcas, use
            &quot;Analisar agora&quot; na Visão geral. Cada conta de anúncio só pode estar atribuída a
            uma marca por vez. Clique numa conta abaixo para ver os anúncios reais e as métricas dela,
            iguais às do Gerenciador de Anúncios.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Plataforma</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Via conexão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última checagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialCredentials.map((credential) => {
                const isExpanded = expandedIds.has(credential.id);
                return (
                  <Fragment key={credential.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleExpanded(credential.id)}
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>{PLATFORM_LABEL[credential.platform]}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{credential.label ?? credential.externalAccountId}</span>
                          {credential.label ? (
                            <span className="text-xs text-muted-foreground">{credential.externalAccountId}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{credential.connectionLabel ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={STATUS_TONE[credential.status]} label={STATUS_LABEL[credential.status]} className="w-fit" />
                          {credential.lastError ? (
                            <span className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="size-3 shrink-0" />
                              {credential.lastError}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {credential.lastCheckedAt
                          ? new Date(credential.lastCheckedAt).toLocaleString("pt-BR")
                          : "nunca"}
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <AdAccountAdsGrid ads={adsByCredential[credential.id] ?? []} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
              {initialCredentials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhuma conta atribuída ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
