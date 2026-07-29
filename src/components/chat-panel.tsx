"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Send, Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { BrandAvatar } from "@/components/brand-avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type MessageRole = "USER" | "ASSISTANT" | "TOOL" | "SYSTEM";

export interface ChatMessageView {
  id: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  brandId: string | null;
  brandName: string | null;
  brandSlug: string | null;
  createdAt: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_ranking: "Consultou o diagnóstico de ranking",
  get_metrics: "Consultou métricas de anúncios",
  get_metrics_history: "Consultou histórico de métricas",
  get_ad_budget: "Consultou a verba atual",
  get_ad_library: "Consultou a biblioteca de anúncios da conta",
  search_public_ad_library: "Pesquisou a biblioteca pública de anúncios",
  propose_action: "Criou uma proposta",
  research_market: "Pesquisa de mercado",
  scan_competitors: "Pesquisa de concorrência",
};

const SUGGESTED_QUESTIONS = [
  "Analise o desempenho das minhas marcas.",
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
  if (typeof parsed.message === "string") return `${label} · ${parsed.message}`;
  return label;
}

interface CreatedProposalInfo {
  brandSlug: string | null;
  brandName: string | null;
}

/** A proposta pode ter sido criada pra qualquer marca do turno - resolve a marca a
 * partir da mensagem de tool especifica que chamou propose_action, nunca de um
 * contexto fixo (o turno pode ter tocado varias marcas). */
function createdProposalInfo(tools: ChatMessageView[]): CreatedProposalInfo | null {
  for (const tool of tools) {
    if (tool.toolName !== "propose_action") continue;
    const parsed = parseToolContent(tool);
    if (parsed?.proposalId) return { brandSlug: tool.brandSlug, brandName: tool.brandName };
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
              {tool.brandName ? `${tool.brandName} · ` : ""}
              {toolSummary(tool)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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
  className,
}: {
  initialMessages: ChatMessageView[];
  onClose?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(content: string) {
    if (!content || isSending) return;

    setInput("");
    setIsSending(true);
    try {
      const response = await fetch(`/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
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
          <span className="truncate text-xs text-muted-foreground">Todas as suas marcas</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", isSending ? "bg-warning animate-pulse" : "bg-success")} />
            {isSending ? "Analisando..." : "Disponível"}
          </div>
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
              <p className="text-sm font-medium">Converse com a JAMILE sobre suas marcas</p>
              <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                Ela analisa diagnóstico e métricas reais, pesquisa a biblioteca de anúncios e sugere
                ajustes de campanha ou criativo em qualquer uma das suas marcas — pode trocar de
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
          return (
            <div key={item.message.id} className="flex flex-col gap-1.5 self-start">
              {item.tools.length > 0 ? <ToolStepsGroup tools={item.tools} /> : null}
              {item.message.brandName ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BrandAvatar name={item.message.brandName} seed={item.message.brandId ?? item.message.brandName} size="xs" />
                  {item.message.brandName}
                </span>
              ) : null}
              <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {item.message.content}
              </div>
              {proposalInfo?.brandSlug ? (
                <Link
                  href={`/brands/${proposalInfo.brandSlug}/proposals`}
                  className="flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  <Sparkles className="size-3" />
                  Proposta criada{proposalInfo.brandName ? ` em ${proposalInfo.brandName}` : ""} — ver na fila
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
            placeholder="Pergunte algo sobre qualquer uma das suas marcas..."
            className="min-h-10 resize-none"
            disabled={isSending}
          />
          <Button onClick={() => sendMessage(input.trim())} disabled={isSending || !input.trim()} className="rounded-full">
            <Send /> Enviar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A JAMILE gera recomendações. Nenhuma alteração é executada sem sua aprovação.
        </p>
      </div>
    </Card>
  );
}
