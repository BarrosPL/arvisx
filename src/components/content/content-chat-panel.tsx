"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type MessageRole = "USER" | "ASSISTANT" | "TOOL" | "SYSTEM";

export interface ContentChatMessageView {
  id: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  contentId: string | null;
  createdAt: string;
}

const SUGGESTED_BRIEFS = [
  "Crie um post sobre cidadania italiana",
  "Faça um story convidando pra uma consulta gratuita",
  "Crie um post sobre documentos necessários pro processo",
];

/** "Nova conversa" - confirmação inline de 2 cliques, mesmo padrão já usado no chat da
 * JAMILE (NewConversationButton em chat-panel.tsx) - não window.confirm() nativo. */
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

function ContentAgentAvatar() {
  return (
    <div className="ai-gradient-bg flex size-9 shrink-0 items-center justify-center rounded-full text-white">
      <Sparkles className="size-4.5" />
    </div>
  );
}

export function ContentChatPanel({ initialMessages }: { initialMessages: ContentChatMessageView[] }) {
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
      const response = await fetch("/api/content/chat/messages", {
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
      setMessages((prev) => [...prev, ...(body.messages as ContentChatMessageView[])]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleNewConversation() {
    const response = await fetch("/api/content/chat", { method: "POST" });
    if (!response.ok) {
      toast.error("Falha ao iniciar nova conversa.");
      return;
    }
    setMessages([]);
  }

  const visibleMessages = messages.filter((m) => m.role === "USER" || m.role === "ASSISTANT");

  return (
    <Card className="flex h-full flex-col gap-0 py-0 shadow-sm">
      <div className="flex items-center gap-3 border-b p-4">
        <ContentAgentAvatar />
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">Assistente de Conteúdo</span>
          <span className="truncate text-xs text-muted-foreground">Geração de peças com IA</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", isSending ? "bg-warning animate-pulse" : "bg-success")} />
            {isSending ? "Gerando..." : "Disponível"}
          </div>
          <NewConversationButton onConfirm={handleNewConversation} />
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
            <ContentAgentAvatar />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Peça uma peça de conteúdo em português</p>
              <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                Descreva o assunto e o assistente gera a imagem seguindo o Brand Kit da sua marca — sem
                editor visual, tudo por conversa. Quer mudar algo? É só pedir.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_BRIEFS.map((brief) => (
                <button
                  key={brief}
                  type="button"
                  onClick={() => sendMessage(brief)}
                  disabled={isSending}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-foreground/30 hover:bg-muted disabled:opacity-50"
                >
                  {brief}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {visibleMessages.map((message) =>
          message.role === "USER" ? (
            <div
              key={message.id}
              className="max-w-[80%] self-end rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground"
            >
              {message.content}
            </div>
          ) : (
            <div key={message.id} className="flex max-w-[85%] flex-col gap-2 self-start">
              {message.contentId ? (
                <div className="overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada dinamicamente, dimensao varia por formato (quadrado/retrato/story) */}
                  <img src={`/api/content/pieces/${message.contentId}/image`} alt="Peça gerada" className="block w-full max-w-sm" />
                </div>
              ) : null}
              <div className="rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
            </div>
          ),
        )}

        {isSending ? (
          <div className="flex items-center gap-1.5 self-start text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-warning" />
            Gerando peça...
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
            placeholder="Descreva a peça que você quer gerar..."
            className="min-h-10 resize-none"
            disabled={isSending}
          />
          <Button onClick={() => sendMessage(input.trim())} disabled={isSending || !input.trim()} className="rounded-full">
            <Send /> Enviar
          </Button>
        </div>
      </div>
    </Card>
  );
}
