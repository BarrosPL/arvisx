import { Radio } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { MetaMark, GoogleAdsMark } from "@/components/brand-marks";
import { formatCurrency, formatNumber } from "@/lib/format";

export interface ActiveCampaignRow {
  key: string;
  /** Nome da conta de anuncio (label da descoberta) - substituiu a marca, que deixou de
   * existir como conceito. */
  accountName: string;
  platform: "META" | "GOOGLE";
  campaignName: string;
  campaignStatus: string | null;
  results: number;
  resultType: string | null;
  cpr: number | null;
  spend: number;
  impressions: number;
  /** Null no Google (nao e metrica padrao de campanha la) e em coleta que falhou -
   * mostrado como "—", nunca como 0, pra nao passar por "alcance zero". */
  reach: number | null;
  cpm: number | null;
}

/** Rotulo legivel pro tipo de acao contado como resultado - o mesmo vocabulario do
 * Gerenciador de Anuncios, pra dar pra conferir de onde veio o numero. */
const RESULT_TYPE_LABEL: Record<string, string> = {
  lead: "Leads",
  "offsite_conversion.fb_pixel_lead": "Leads (pixel)",
  "onsite_conversion.lead_grouped": "Leads",
  purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (pixel)",
  omni_purchase: "Compras",
  link_click: "Cliques no link",
  landing_page_view: "Visitas à página",
  post_engagement: "Engajamentos",
  page_engagement: "Engajamentos",
  video_view: "Visualizações",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas",
  "onsite_conversion.total_messaging_connection": "Conversas",
  reach: "Alcance",
  impressions: "Impressões",
  app_install: "Instalações",
  mobile_app_install: "Instalações",
  omni_app_install: "Instalações",
  complete_registration: "Cadastros",
  "offsite_conversion.fb_pixel_complete_registration": "Cadastros",
  like: "Curtidas",
  store_visit: "Visitas à loja",
  conversions: "Conversões",
};

function statusTone(status: string | null): StatusTone {
  if (!status) return "neutral";
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLED") return "success";
  if (normalized === "PAUSED") return "neutral";
  return "warning";
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLED") return "Ativa";
  if (normalized === "PAUSED") return "Pausada";
  return status;
}

function resultLabel(resultType: string | null): string {
  if (!resultType) return "Resultado";
  return RESULT_TYPE_LABEL[resultType] ?? resultType;
}

function PlatformIcon({ platform }: { platform: "META" | "GOOGLE" }) {
  return platform === "META" ? (
    <MetaMark className="size-4 text-[#0866FF]" />
  ) : (
    <GoogleAdsMark className="size-4 text-[#EA8600]" />
  );
}

/**
 * Tabela das campanhas que estao veiculando agora, com as metricas que o gestor
 * acompanha. Le do banco (alimentado pelo ciclo de coleta de 15min), nunca da API na
 * hora do acesso - a versao anterior consultava Meta/Google a cada carregamento de
 * pagina e isso deixou o sistema lento e fez a Meta recusar por excesso de requisicao.
 */
export function ActiveCampaignsTable({ rows }: { rows: ActiveCampaignRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="Nenhuma campanha ativa no momento"
        description="Assim que uma conta conectada tiver campanha veiculando, ela aparece aqui com as métricas dos últimos 7 dias."
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Tabela no desktop */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Campanha</TableHead>
              <TableHead className="text-right">Resultado</TableHead>
              <TableHead className="text-right">CPR</TableHead>
              <TableHead className="text-right">Valor gasto</TableHead>
              <TableHead className="text-right">Impressões</TableHead>
              <TableHead className="text-right">Alcance</TableHead>
              <TableHead className="text-right">CPM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <StatusBadge tone={statusTone(row.campaignStatus)} label={statusLabel(row.campaignStatus)} />
                </TableCell>
                <TableCell className="max-w-40">
                  <span className="block truncate text-sm text-muted-foreground" title={row.accountName}>
                    {row.accountName}
                  </span>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={row.platform} />
                    <span className="truncate text-sm font-medium" title={row.campaignName}>
                      {row.campaignName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-medium tabular-nums">{formatNumber(row.results)}</span>
                    <span className="text-xs text-muted-foreground">{resultLabel(row.resultType)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.cpr !== null ? formatCurrency(row.cpr) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.reach !== null ? formatNumber(row.reach) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.cpm !== null ? formatCurrency(row.cpm) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Cards empilhados no mobile - mesmo padrao ja usado na lista de /brands */}
      <div className="flex flex-col divide-y md:hidden">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <PlatformIcon platform={row.platform} />
                <span className="min-w-0 truncate text-sm font-medium">{row.campaignName}</span>
              </div>
              <StatusBadge
                tone={statusTone(row.campaignStatus)}
                label={statusLabel(row.campaignStatus)}
                className="shrink-0"
              />
            </div>
            <span className="text-xs text-muted-foreground">{row.accountName}</span>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <MobileStat label={resultLabel(row.resultType)} value={formatNumber(row.results)} />
              <MobileStat label="CPR" value={row.cpr !== null ? formatCurrency(row.cpr) : "—"} />
              <MobileStat label="Gasto" value={formatCurrency(row.spend)} />
              <MobileStat label="Impressões" value={formatNumber(row.impressions)} />
              <MobileStat label="Alcance" value={row.reach !== null ? formatNumber(row.reach) : "—"} />
              <MobileStat label="CPM" value={row.cpm !== null ? formatCurrency(row.cpm) : "—"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
