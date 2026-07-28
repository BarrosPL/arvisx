"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type MessageRole = "USER" | "ASSISTANT" | "TOOL" | "SYSTEM";

export interface ChatMessageView {
  id: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  createdAt: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_ranking: "Consultou o diagnóstico de ranking",
  get_metrics: "Consultou métricas de anúncios",
  propose_action: "Criou uma proposta",
  research_market: "Pesquisa de mercado",
  scan_competitors: "Pesquisa de concorrência",
};

function toolSummary(message: ChatMessageView): string {
  const label = TOOL_LABEL[message.toolName ?? ""] ?? message.toolName ?? "Ferramenta";
  try {
    const parsed = JSON.parse(message.content);
    if (message.toolName === "propose_action" && parsed.proposalId) {
      return `${label} · status: ${parsed.status}${parsed.missing?.length ? ` (faltando: ${parsed.missing.join(", ")})` : ""}`;
    }
    if (parsed.message) return `${label} · ${parsed.message}`;
  } catch {
    // conteudo nao era JSON, cai no label simples
  }
  return label;
}

export function ChatPanel({
  brandId,
  initialMessages,
}: {
  brandId: string;
  initialMessages: ChatMessageView[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const content = input.trim();
    if (!content || isSending) return;

    setInput("");
    setIsSending(true);
    try {
      const response = await fetch(`/api/brands/${brandId}/chat/messages`, {
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

  return (
    <Card className="flex h-[calc(100vh-14rem)] flex-col shadow-sm">
      <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Converse com a JAMILE sobre esta marca - peça um diagnóstico, pergunte sobre métricas ou
            discuta uma ação. Ela nunca executa nada sozinha: toda ação vira uma proposta na fila de
            aprovação.
          </p>
        ) : null}
        {messages.map((message) => {
          if (message.role === "TOOL") {
            return (
              <div key={message.id} className="flex items-center gap-2 self-start text-xs text-muted-foreground">
                <Wrench className="size-3.5" />
                {toolSummary(message)}
              </div>
            );
          }
          const isUser = message.role === "USER";
          return (
            <div
              key={message.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                isUser ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted"
              }`}
            >
              {message.content}
            </div>
          );
        })}
        {isSending ? <p className="self-start text-xs text-muted-foreground">JAMILE está analisando...</p> : null}
        <div ref={bottomRef} />
      </CardContent>
      <div className="flex gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Pergunte algo sobre esta marca..."
          className="min-h-10 resize-none"
          disabled={isSending}
        />
        <Button onClick={handleSend} disabled={isSending || !input.trim()} className="rounded-full">
          <Send /> Enviar
        </Button>
      </div>
    </Card>
  );
}
