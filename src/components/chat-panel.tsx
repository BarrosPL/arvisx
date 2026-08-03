"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, RotateCcw, Send, Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MISSING_CREATIVE_ASSET_LABEL, MISSING_FUNNEL_CREATIVE_ASSETS_LABEL } from "@/lib/proposals/dataEnforcement";

type MessageRole = "USER" | "ASSISTANT" | "TOOL" | "SYSTEM";

export interface ChatMessageView {
  id: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  accountId: string | null;
  accountName: string | null;
  createdAt: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_ranking: "Consultou o diagnóstico de ranking",
  get_metrics: "Consultou métricas de anúncios",
  get_metrics_history: "Consultou histórico de métricas",
  get_ad_sets: "Agrupou anúncios por conjunto de anúncios",
  get_campaigns: "Consultou as campanhas",
  get_ad_budget: "Consultou a verba atual",
  get_ad_library: "Consultou a biblioteca de anúncios da conta",
  search_public_ad_library: "Pesquisou a biblioteca pública de anúncios",
  propose_action: "Criou uma proposta",
  get_proposal: "Consultou os detalhes de uma proposta",
  confirm_and_execute_action: "Confirmou e executou uma ação",
  resolve_proposal: "Decidiu e executou uma proposta",
  adjust_proposal: "Ajustou uma proposta",
  delete_proposal: "Excluiu uma proposta",
  research_market: "Pesquisa de mercado",
  scan_competitors: "Pesquisa de concorrência",
};

const SUGGESTED_QUESTIONS = [
  "Analise o desempenho das minhas contas.",
  "Onde estou desperdiçando verba?",
  "Quais campanhas precisam de atenção?",
  "Crie uma proposta de otimização.",
  "Resuma os principais resultados.",
];

function parseToolContent(message: ChatMessageView): Record<string, unknown> | null {
  try {
    return JSON.parse(message.content);
  } catch {
    return null;
  }
}

function toolSummary(message: ChatMessageView): string {
  const label = TOOL_LABEL[message.toolName ?? ""] ?? message.toolName ?? "Ferramenta";
  const parsed = parseToolContent(message);
  if (!parsed) return label;
  if (message.toolName === "propose_action" && parsed.proposalId) {
    const missing = Array.isArray(parsed.missing) ? (parsed.missing as string[]) : [];
    return `${label} · status: ${parsed.status}${missing.length ? ` (faltando: ${missing.join(", ")})` : ""}`;
  }
  if (message.toolName === "get_ad_sets" && typeof parsed.totalAdSets === "number") {
    return `${label} · ${parsed.totalAdSets} conjunto(s), ${parsed.totalAds} anúncio(s) no total`;
  }
  if (message.toolName === "get_proposal" && typeof parsed.status === "string") {
    return `${label} · status: ${parsed.status}`;
  }
  if (message.toolName === "adjust_proposal" && typeof parsed.status === "string") {
    return `${label} · novo status: ${parsed.status}`;
  }
  if (message.toolName === "confirm_and_execute_action" || message.toolName === "resolve_proposal") {
    if (parsed.executed === false) {
      const missing = Array.isArray(parsed.missing) ? (parsed.missing as string[]) : [];
      return `${label} · status: ${parsed.status}${missing.length ? ` (faltando: ${missing.join(", ")})` : ""}`;
    }
    return parsed.executionStatus === "SUCCESS"
      ? `${label} · executado com sucesso`
      : `${label} · falhou (${typeof parsed.errorMessage === "string" ? parsed.errorMessage : "erro desconhecido"})`;
  }
  if (typeof parsed.message === "string") return `${label} · ${parsed.message}`;
  return label;
}

/** Proposta NEW_CAMPAIGN (Meta) que acabou de nascer/ser consultada e ainda falta o
 * criativo (imagem OU video+capa) - unico caso onde o chat mostra um uploader inline
 * (ver ChatCreativeAssetPicker abaixo). Cobre propose_action e confirm_and_execute_action
 * (campo "missing" ja diz isso) e get_proposal (campos "type"/"status"/
 * "hasCreativeAsset" explicitos). */
function pendingCreativeAssetProposal(tools: ChatMessageView[]): { proposalId: string } | null {
  for (const tool of tools) {
    const parsed = parseToolContent(tool);
    if (!parsed) continue;
    if (
      (tool.toolName === "propose_action" || tool.toolName === "confirm_and_execute_action") &&
      typeof parsed.proposalId === "string"
    ) {
      const missing = Array.isArray(parsed.missing) ? (parsed.missing as string[]) : [];
      if (missing.includes(MISSING_CREATIVE_ASSET_LABEL)) return { proposalId: parsed.proposalId };
    }
    if (
      tool.toolName === "get_proposal" &&
      typeof parsed.id === "string" &&
      parsed.type === "NEW_CAMPAIGN" &&
      parsed.status === "NEEDS_MORE_DATA" &&
      parsed.hasCreativeAsset === false
    ) {
      return { proposalId: parsed.id };
    }
  }
  return null;
}

/** Mesma ideia de pendingCreativeAssetProposal, pra NEW_FUNNEL (5 camadas) - abre
 * ChatFunnelAssetPicker em vez do de proposta unica. get_proposal nao precisa checar
 * funnelLayersStatus aqui: NEEDS_MORE_DATA numa NEW_FUNNEL so acontece por falta de
 * criativo (ver dataEnforcement.ts), nunca por outro motivo. */
function pendingFunnelAssetProposal(tools: ChatMessageView[]): { proposalId: string } | null {
  for (const tool of tools) {
    const parsed = parseToolContent(tool);
    if (!parsed) continue;
    if (
      (tool.toolName === "propose_action" || tool.toolName === "confirm_and_execute_action") &&
      typeof parsed.proposalId === "string"
    ) {
      const missing = Array.isArray(parsed.missing) ? (parsed.missing as string[]) : [];
      if (missing.includes(MISSING_FUNNEL_CREATIVE_ASSETS_LABEL)) return { proposalId: parsed.proposalId };
    }
    if (
      tool.toolName === "get_proposal" &&
      typeof parsed.id === "string" &&
      parsed.type === "NEW_FUNNEL" &&
      parsed.status === "NEEDS_MORE_DATA"
    ) {
      return { proposalId: parsed.id };
    }
  }
  return null;
}

interface CreatedProposalInfo {
  accountName: string | null;
}

/** A proposta pode ter sido criada pra qualquer conta do turno - resolve a conta a
 * partir da mensagem de tool especifica que chamou propose_action, nunca de um
 * contexto fixo (o turno pode ter tocado varias contas). */
function createdProposalInfo(tools: ChatMessageView[]): CreatedProposalInfo | null {
  for (const tool of tools) {
    if (tool.toolName !== "propose_action" && tool.toolName !== "confirm_and_execute_action") continue;
    const parsed = parseToolContent(tool);
    if (parsed?.proposalId) return { accountName: tool.accountName };
  }
  return null;
}

type ChatItem =
  | { type: "user"; message: ChatMessageView }
  | { type: "assistant"; message: ChatMessageView; tools: ChatMessageView[] }
  | { type: "tools"; tools: ChatMessageView[] };

function groupMessages(messages: ChatMessageView[]): ChatItem[] {
  const items: ChatItem[] = [];
  let pendingTools: ChatMessageView[] = [];

  for (const message of messages) {
    if (message.role === "TOOL") {
      pendingTools.push(message);
      continue;
    }
    if (message.role === "USER") {
      if (pendingTools.length) {
        items.push({ type: "tools", tools: pendingTools });
        pendingTools = [];
      }
      items.push({ type: "user", message });
      continue;
    }
    items.push({ type: "assistant", message, tools: pendingTools });
    pendingTools = [];
  }
  if (pendingTools.length) {
    items.push({ type: "tools", tools: pendingTools });
  }
  return items;
}

function ToolStepsGroup({ tools }: { tools: ChatMessageView[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex max-w-[85%] flex-col gap-1 self-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Wrench className="size-3" />
        Etapas da análise ({tools.length})
      </button>
      {open ? (
        <div className="flex flex-col gap-1 border-l pl-3">
          {tools.map((tool) => (
            <span key={tool.id} className="text-xs text-muted-foreground">
              {tool.accountName ? `${tool.accountName} · ` : ""}
              {toolSummary(tool)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Anexa a IMAGEM de uma proposta NEW_CAMPAIGN (Meta) - um dos dois formatos possiveis
 * (ver ChatCreativeVideoUpload pro outro). A JAMILE nunca gera/promete o criativo, um
 * humano anexa aqui dentro da propria conversa. Reaproveita a mesma rota
 * POST /api/proposals/[id]/creative-asset ja usada antes em proposal-card.tsx.
 */
function ChatCreativeAssetUpload({ proposalId, onDone }: { proposalId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch(`/api/proposals/${proposalId}/creative-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, mimeType: file.type }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao anexar imagem.");
        return;
      }
      toast.success("Imagem anexada — proposta liberada para aprovação.");
      onDone();
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex w-fit flex-wrap items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
      <input
        type="file"
        accept="image/jpeg,image/png"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="max-w-40 text-xs file:mr-1.5 file:rounded-full file:border-0 file:bg-foreground file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-background"
      />
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || isUploading}
        className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        Anexar
      </button>
    </div>
  );
}

/**
 * Anexa VIDEO + capa de uma proposta NEW_CAMPAIGN (Meta) - os dois arquivos juntos,
 * porque video_data da Meta exige uma URL publica de thumbnail (ver
 * lib/media/publicAssets.ts) que so existe depois de subir uma imagem de capa junto.
 * Reaproveita POST /api/proposals/[id]/creative-video-asset.
 */
function ChatCreativeVideoUpload({ proposalId, onDone }: { proposalId: string; onDone: () => void }) {
  const [video, setVideo] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload() {
    if (!video || !cover) return;
    setIsUploading(true);
    try {
      const [videoBase64, coverImageBase64] = await Promise.all([fileToBase64(video), fileToBase64(cover)]);
      const response = await fetch(`/api/proposals/${proposalId}/creative-video-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoBase64,
          videoMimeType: video.type,
          coverImageBase64,
          coverImageMimeType: cover.type,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao anexar vídeo.");
        return;
      }
      toast.success("Vídeo anexado — proposta liberada para aprovação.");
      onDone();
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex w-fit flex-col gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs">
      <label className="flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-muted-foreground">Vídeo</span>
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          onChange={(event) => setVideo(event.target.files?.[0] ?? null)}
          className="max-w-36 text-xs file:mr-1.5 file:rounded-full file:border-0 file:bg-foreground file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-background"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-muted-foreground">Capa</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => setCover(event.target.files?.[0] ?? null)}
          className="max-w-36 text-xs file:mr-1.5 file:rounded-full file:border-0 file:bg-foreground file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-background"
        />
      </label>
      <button
        type="button"
        onClick={handleUpload}
        disabled={!video || !cover || isUploading}
        className="self-end rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        Anexar
      </button>
    </div>
  );
}

/**
 * Deixa o humano escolher o formato antes de mostrar o uploader certo - o sistema
 * suporta os dois (ver ChatCreativeAssetUpload/ChatCreativeVideoUpload), nunca escolhe
 * sozinho por ele.
 */
function ChatCreativeAssetPicker({ proposalId }: { proposalId: string }) {
  const [format, setFormat] = useState<"image" | "video" | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="w-fit rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success">
        Criativo anexado
      </p>
    );
  }

  if (format === "image") return <ChatCreativeAssetUpload proposalId={proposalId} onDone={() => setDone(true)} />;
  if (format === "video") return <ChatCreativeVideoUpload proposalId={proposalId} onDone={() => setDone(true)} />;

  return (
    <div className="flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">Anexar criativo:</span>
      <button
        type="button"
        onClick={() => setFormat("image")}
        className="rounded-full border px-2.5 py-1 font-medium transition-colors hover:bg-muted"
      >
        Imagem
      </button>
      <button
        type="button"
        onClick={() => setFormat("video")}
        className="rounded-full border px-2.5 py-1 font-medium transition-colors hover:bg-muted"
      >
        Vídeo
      </button>
    </div>
  );
}

const FUNNEL_LAYER_ORDER = ["FRIO", "MORNO", "QUENTE", "REMARKETING", "LOOKALIKE"] as const;
const FUNNEL_LAYER_LABELS: Record<(typeof FUNNEL_LAYER_ORDER)[number], string> = {
  FRIO: "Frio",
  MORNO: "Morno",
  QUENTE: "Quente",
  REMARKETING: "Remarketing",
  LOOKALIKE: "1% (Lookalike)",
};

/**
 * Uma linha do uploader de funil - imagem OU video+capa pra UMA camada, reaproveitando
 * a mesma rota /funnel-layer-asset pros dois formatos (o `layerKey` que diferencia).
 * Menor/mais compacto que ChatCreativeAssetPicker de proposito - aqui aparecem 5 de
 * uma vez, o par inteiro nao cabe no mesmo espaço.
 */
function ChatFunnelLayerUpload({
  proposalId,
  layerKey,
  onDone,
}: {
  proposalId: string;
  layerKey: (typeof FUNNEL_LAYER_ORDER)[number];
  onDone: () => void;
}) {
  const [format, setFormat] = useState<"image" | "video" | null>(null);
  const [done, setDone] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  async function upload(body: Record<string, string>) {
    setIsUploading(true);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/funnel-layer-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layerKey, ...body }),
      });
      const parsedBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(parsedBody.error ?? `Falha ao anexar criativo de ${FUNNEL_LAYER_LABELS[layerKey]}.`);
        return;
      }
      setDone(true);
      onDone();
    } finally {
      setIsUploading(false);
    }
  }

  async function handleImageUpload() {
    if (!imageFile) return;
    const dataBase64 = await fileToBase64(imageFile);
    await upload({ dataBase64, mimeType: imageFile.type });
  }

  async function handleVideoUpload() {
    if (!videoFile || !coverFile) return;
    const [videoBase64, coverImageBase64] = await Promise.all([fileToBase64(videoFile), fileToBase64(coverFile)]);
    await upload({ videoBase64, videoMimeType: videoFile.type, coverImageBase64, coverImageMimeType: coverFile.type });
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-28 shrink-0 font-medium">{FUNNEL_LAYER_LABELS[layerKey]}</span>
        <span className="text-success">Anexado</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-xs">
      <span className="font-medium">{FUNNEL_LAYER_LABELS[layerKey]}</span>
      {format === null ? (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setFormat("image")} className="rounded-full border px-2 py-0.5 transition-colors hover:bg-muted">
            Imagem
          </button>
          <button type="button" onClick={() => setFormat("video")} className="rounded-full border px-2 py-0.5 transition-colors hover:bg-muted">
            Vídeo
          </button>
        </div>
      ) : format === "image" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
            className="max-w-32 text-[10px] file:mr-1 file:rounded-full file:border-0 file:bg-foreground file:px-1.5 file:py-0.5 file:text-[9px] file:font-medium file:text-background"
          />
          <button
            type="button"
            onClick={handleImageUpload}
            disabled={!imageFile || isUploading}
            className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground disabled:opacity-50"
          >
            Anexar
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <input
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
            className="max-w-32 text-[10px] file:mr-1 file:rounded-full file:border-0 file:bg-foreground file:px-1.5 file:py-0.5 file:text-[9px] file:font-medium file:text-background"
          />
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
            className="max-w-32 text-[10px] file:mr-1 file:rounded-full file:border-0 file:bg-foreground file:px-1.5 file:py-0.5 file:text-[9px] file:font-medium file:text-background"
          />
          <button
            type="button"
            onClick={handleVideoUpload}
            disabled={!videoFile || !coverFile || isUploading}
            className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground disabled:opacity-50"
          >
            Anexar
          </button>
        </div>
      )}
    </div>
  );
}

/** As 5 camadas de uma proposta NEW_FUNNEL, cada uma com seu proprio uploader - a
 * proposta so sai de NEEDS_MORE_DATA quando as 5 tiverem algum criativo (a rota
 * /funnel-layer-asset checa isso a cada upload, ver route.ts). */
function ChatFunnelAssetPicker({ proposalId }: { proposalId: string }) {
  const [doneCount, setDoneCount] = useState(0);
  const allDone = doneCount >= FUNNEL_LAYER_ORDER.length;

  return (
    <div className="flex w-fit flex-col gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 p-2">
      <p className="text-xs font-medium">
        {allDone
          ? "Todos os criativos anexados — proposta liberada para aprovação."
          : `Anexe o criativo de cada camada (${doneCount}/${FUNNEL_LAYER_ORDER.length}):`}
      </p>
      {!allDone
        ? FUNNEL_LAYER_ORDER.map((layerKey) => (
            <ChatFunnelLayerUpload key={layerKey} proposalId={proposalId} layerKey={layerKey} onDone={() => setDoneCount((c) => c + 1)} />
          ))
        : null}
    </div>
  );
}

/**
 * "Nova conversa" - arquiva a thread atual (nunca apaga, ver startNewUserThread em
 * orchestrator.ts) e limpa a tela. Confirmação inline de 2 cliques, mesmo padrão já
 * usado em attention-item.tsx pra excluir proposta - não um window.confirm() nativo,
 * que destoaria do resto da UI.
 */
function NewConversationButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  async function handleConfirm() {
    setIsStarting(true);
    try {
      await onConfirm();
      toast.success("Nova conversa iniciada — a anterior continua guardada.");
    } finally {
      setIsStarting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Começar do zero?</span>
        <button
          type="button"
          disabled={isStarting}
          onClick={() => setConfirming(false)}
          aria-label="Cancelar"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={isStarting}
          onClick={handleConfirm}
          aria-label="Confirmar nova conversa"
          className="flex size-6 items-center justify-center rounded-md text-primary hover:bg-primary/10"
        >
          <Check className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="Nova conversa"
      title="Nova conversa"
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <RotateCcw className="size-3.5" />
    </button>
  );
}

function JamileAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "ai-gradient-bg flex shrink-0 items-center justify-center rounded-full text-white",
        size === "sm" ? "size-7" : "size-9"
      )}
    >
      <Sparkles className={size === "sm" ? "size-3.5" : "size-4.5"} />
    </div>
  );
}

export function ChatPanel({
  initialMessages,
  onClose,
  onStartNewConversation,
  className,
  autoSend,
  autoSendContextProposalId,
  autoSendNeedsCreativeAsset,
  autoSendNeedsFunnelAssets,
  onAutoSent,
}: {
  initialMessages: ChatMessageView[];
  onClose?: () => void;
  /** Arquiva a thread atual e comeca uma em branco - ver NewConversationButton. */
  onStartNewConversation?: () => Promise<void>;
  className?: string;
  /** Mensagem pra enviar automaticamente quando definida/mudar - usado quando o chat
   * abre focado num assunto (ex: clicar numa notificacao de proposta). Ver
   * jamile-launcher.tsx openChat({ prefill }). */
  autoSend?: string | null;
  /** Id da proposta que autoSend e "sobre" - vai pro backend pelo canal estrutural
   * (nunca aparece no texto da bolha). So se aplica a ESSE envio automatico. */
  autoSendContextProposalId?: string;
  /** A proposta de autoSendContextProposalId e uma NEW_CAMPAIGN parada so por falta do
   * criativo - mostra o uploader "fixo" (pinnedCreativeAssetProposalId abaixo) direto,
   * sem depender de nenhuma tool call ter acontecido no turno (o contexto estrutural
   * injetado no backend pode fazer a JAMILE responder sem chamar get_proposal). */
  autoSendNeedsCreativeAsset?: boolean;
  /** Mesma ideia, pra NEW_FUNNEL (5 camadas) - mostra o uploader das 5 camadas fixo. */
  autoSendNeedsFunnelAssets?: boolean;
  onAutoSent?: () => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  // So le as props na montagem (mesmo padrao de useState(initialMessages) acima) - o
  // valor ja e conhecido de imediato, nao depende do round-trip do autoSend, entao nao
  // precisa de useEffect nenhum pra isto.
  const [pinnedCreativeAssetProposalId] = useState<string | null>(
    autoSendNeedsCreativeAsset && autoSendContextProposalId ? autoSendContextProposalId : null
  );
  const [pinnedFunnelAssetProposalId] = useState<string | null>(
    autoSendNeedsFunnelAssets && autoSendContextProposalId ? autoSendContextProposalId : null
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (!autoSend) return;
    sendMessage(autoSend, autoSendContextProposalId);
    onAutoSent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend]);

  async function sendMessage(content: string, contextProposalId?: string) {
    if (!content || isSending) return;

    setInput("");
    setIsSending(true);
    try {
      const response = await fetch(`/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, contextProposalId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao enviar mensagem.");
        setInput(content);
        return;
      }
      setMessages((prev) => [...prev, ...(body.messages as ChatMessageView[])]);
    } finally {
      setIsSending(false);
    }
  }

  const items = groupMessages(messages);

  return (
    <Card className={cn("flex h-full flex-col gap-0 shadow-sm py-0", className)}>
      <div className="flex items-center gap-3 border-b p-4">
        <JamileAvatar />
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">JAMILE</span>
          <span className="truncate text-xs text-muted-foreground">Todas as suas contas</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", isSending ? "bg-warning animate-pulse" : "bg-success")} />
            {isSending ? "Analisando..." : "Disponível"}
          </div>
          {onStartNewConversation ? <NewConversationButton onConfirm={onStartNewConversation} /> : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar chat"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
            <JamileAvatar />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Converse com a JAMILE sobre suas contas</p>
              <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                Ela analisa diagnóstico e métricas reais, pesquisa a biblioteca de anúncios e sugere
                ajustes de campanha ou criativo em qualquer uma das suas contas — pode trocar de
                assunto na mesma conversa. Toda ação vira uma proposta na fila de aprovação — nunca é
                executada sozinha.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => sendMessage(question)}
                  disabled={isSending}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-foreground/30 hover:bg-muted disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {items.map((item, index) => {
          if (item.type === "tools") {
            return <ToolStepsGroup key={`tools-${index}`} tools={item.tools} />;
          }
          if (item.type === "user") {
            return (
              <div
                key={item.message.id}
                className="max-w-[80%] self-end rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground"
              >
                {item.message.content}
              </div>
            );
          }
          const proposalInfo = createdProposalInfo(item.tools);
          const pendingAsset = pendingCreativeAssetProposal(item.tools);
          const pendingFunnelAsset = pendingFunnelAssetProposal(item.tools);
          return (
            <div key={item.message.id} className="flex flex-col gap-1.5 self-start">
              {item.tools.length > 0 ? <ToolStepsGroup tools={item.tools} /> : null}
              {item.message.accountName ? (
                <span className="text-xs text-muted-foreground">{item.message.accountName}</span>
              ) : null}
              <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {item.message.content}
              </div>
              {pendingAsset ? <ChatCreativeAssetPicker proposalId={pendingAsset.proposalId} /> : null}
              {pendingFunnelAsset ? <ChatFunnelAssetPicker proposalId={pendingFunnelAsset.proposalId} /> : null}
              {proposalInfo ? (
                <Link
                  href="/proposals"
                  className="flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  <Sparkles className="size-3" />
                  Proposta criada{proposalInfo.accountName ? ` em ${proposalInfo.accountName}` : ""} — ver na fila
                </Link>
              ) : null}
            </div>
          );
        })}
        {isSending ? (
          <div className="flex items-center gap-1.5 self-start text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-warning" />
            JAMILE está analisando...
          </div>
        ) : null}
        <div ref={bottomRef} />
      </CardContent>

      {pinnedCreativeAssetProposalId ? (
        <div className="border-t px-3 py-2">
          <p className="mb-1.5 text-xs text-muted-foreground">Anexe o criativo desta proposta:</p>
          <ChatCreativeAssetPicker proposalId={pinnedCreativeAssetProposalId} />
        </div>
      ) : null}

      {pinnedFunnelAssetProposalId ? (
        <div className="border-t px-3 py-2">
          <ChatFunnelAssetPicker proposalId={pinnedFunnelAssetProposalId} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(input.trim());
              }
            }}
            placeholder="Pergunte algo sobre qualquer uma das suas contas..."
            className="min-h-10 resize-none"
            disabled={isSending}
          />
          <Button onClick={() => sendMessage(input.trim())} disabled={isSending || !input.trim()} className="rounded-full">
            <Send /> Enviar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Aprovar, ajustar e executar também acontece por aqui — a JAMILE sempre confirma a ação exata antes de agir.
        </p>
      </div>
    </Card>
  );
}
