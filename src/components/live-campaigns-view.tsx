import { Radio } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import type { LiveAccountSnapshot, LiveCampaign } from "@/lib/ads/liveSnapshot";

function adStatusTone(status: string | null): StatusTone {
  if (!status) return "neutral";
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLED") return "success";
  if (normalized === "PAUSED") return "neutral";
  return "warning";
}

/** Sem "use client" de proposito - <details>/<summary> nativos dao o colapsar/expandir
 * sem precisar de estado React, mantendo essa secao 100% server-rendered. */
function CampaignBlock({ campaign }: { campaign: LiveCampaign }) {
  const totalAds = campaign.adSets.reduce((sum, adSet) => sum + adSet.ads.length, 0);
  return (
    <details className="rounded-lg border bg-background">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium marker:content-none">
        <span className="truncate">{campaign.campaignName ?? "Campanha sem nome"}</span>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">
          {campaign.adSets.length} conjunto(s) · {totalAds} anúncio(s)
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 py-3">
        {campaign.adSets.map((adSet) => (
          <div key={adSet.platformAdSetId ?? "sem-conjunto"} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {adSet.adSetName ?? "Conjunto sem nome"}
            </span>
            <div className="flex flex-col gap-1 border-l pl-3">
              {adSet.ads.map((ad) => (
                <div key={ad.platformAdId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs">{ad.adName ?? ad.platformAdId}</span>
                  <StatusBadge tone={adStatusTone(ad.status)} label={ad.status ?? "—"} className="shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export interface LiveBrandSnapshot {
  id: string;
  name: string;
  slug: string;
  snapshots: LiveAccountSnapshot[];
}

/**
 * Substitui a lista de marcas do dashboard - mostra ao vivo (direto do Meta/Google,
 * sem passar pela coleta periodica) as campanhas/conjuntos/anuncios que as contas
 * conectadas de cada marca estao servindo agora, pro gestor acompanhar em tempo real.
 * Marca sem credencial conectada, ou cuja conta nao devolveu campanha nenhuma, nao
 * aparece aqui (fica só no fluxo de onboarding/conexão, inalterado).
 */
export function LiveCampaignsView({ brands }: { brands: LiveBrandSnapshot[] }) {
  const withCampaigns = brands
    .map((brand) => ({ ...brand, campaigns: brand.snapshots.flatMap((snapshot) => snapshot.campaigns) }))
    .filter((brand) => brand.campaigns.length > 0);

  const errorSnapshots = brands.flatMap((brand) =>
    brand.snapshots.filter((s) => s.state === "API_ERROR" || s.state === "AUTH_ERROR").map((s) => ({ brand, snapshot: s }))
  );

  if (withCampaigns.length === 0 && errorSnapshots.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="Nada rodando agora"
        description="Assim que uma conta conectada tiver campanhas ativas, elas aparecem aqui em tempo real."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {errorSnapshots.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {errorSnapshots.map(({ brand, snapshot }) => (
            <div key={snapshot.credentialId} className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone="danger" label="Erro ao consultar ao vivo" />
              <span>
                {brand.name} · {snapshot.errorMessage ?? "Falha desconhecida"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {withCampaigns.map((brand) => (
        <div key={brand.id} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{brand.name}</h3>
          <div className="flex flex-col gap-2">
            {brand.campaigns.map((campaign, index) => (
              <CampaignBlock key={campaign.platformCampaignId ?? `${brand.id}-${index}`} campaign={campaign} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
