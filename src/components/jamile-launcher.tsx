"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { ChatPanel, type ChatMessageView } from "@/components/chat-panel";
import { cn } from "@/lib/utils";

interface JamileChatContextValue {
  open: boolean;
  /** `prefill` envia essa mensagem automaticamente assim que a conversa abrir/estiver
   * carregada - usado por notificacoes (ex: clicar numa proposta pendente) pra abrir
   * o chat ja focado no assunto, em vez de navegar pra uma pagina. `contextProposalId`
   * (opcional) leva o id da proposta pelo canal estrutural, sem aparecer no texto que
   * o usuario "fala" - ver orchestrator.ts (runAgentTurn) pra como isso vira contexto
   * pra JAMILE sem virar um id cru na bolha de mensagem. */
  openChat: (options?: {
    prefill?: string;
    contextProposalId?: string;
    needsCreativeAsset?: boolean;
    needsFunnelAssets?: boolean;
  }) => void;
  closeChat: () => void;
  toggleChat: () => void;
}

const JamileChatContext = createContext<JamileChatContextValue | null>(null);

/** Deixa qualquer componente da árvore abrir o popup da JAMILE (ex: um botão
 * "Falar com a JAMILE" em qualquer página), sem precisar saber como o painel
 * é montado/carregado - só chama openChat(). */
export function useJamileChat(): JamileChatContextValue {
  const ctx = useContext(JamileChatContext);
  if (!ctx) throw new Error("useJamileChat precisa estar dentro de <JamileProvider>");
  return ctx;
}

/**
 * Provedor + popup da JAMILE, montado uma unica vez em (app)/layout.tsx - fica
 * disponivel em qualquer pagina do app, e o estado aberto/fechado + a thread
 * carregada sobrevivem a navegacao entre paginas porque o layout nao remonta esse
 * componente ao trocar de rota dentro do grupo (app).
 */
export function JamileProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  // ChatPanel guarda "messages" em estado PROPRIO (useState(initialMessages) - so le a
  // prop na primeira montagem, nunca resincroniza sozinho se ela mudar depois). Usar o
  // id da thread como "key" forca o React a remontar o ChatPanel do zero quando a
  // thread ativa troca (nova conversa) - a forma mais simples de garantir que a tela
  // realmente limpa, sem duplicar o estado de mensagens em dois componentes.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<string | null>(null);
  const [pendingContextProposalId, setPendingContextProposalId] = useState<string | undefined>(undefined);
  const [pendingNeedsCreativeAsset, setPendingNeedsCreativeAsset] = useState(false);
  const [pendingNeedsFunnelAssets, setPendingNeedsFunnelAssets] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch("/api/chat")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setMessages(body.messages ?? []);
        setThreadId(body.thread?.id ?? null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const openChat = (options?: {
    prefill?: string;
    contextProposalId?: string;
    needsCreativeAsset?: boolean;
    needsFunnelAssets?: boolean;
  }) => {
    setOpen(true);
    if (options?.prefill) setPendingPrefill(options.prefill);
    if (options?.contextProposalId) setPendingContextProposalId(options.contextProposalId);
    if (options?.needsCreativeAsset) setPendingNeedsCreativeAsset(true);
    if (options?.needsFunnelAssets) setPendingNeedsFunnelAssets(true);
  };
  const closeChat = () => setOpen(false);
  const toggleChat = () => setOpen((v) => !v);

  /** "Nova conversa" - arquiva a thread atual no servidor (nunca apaga, ver
   * startNewUserThread em orchestrator.ts) e limpa a tela local pra refletir isso. */
  async function startNewConversation() {
    const response = await fetch("/api/chat", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setMessages(body.messages ?? []);
    setThreadId(body.thread?.id ?? null);
  }

  return (
    <JamileChatContext.Provider value={{ open, openChat, closeChat, toggleChat }}>
      {children}

      {/* z-[60], acima do painel (z-50) - o botao continua clicavel mesmo quando o
          painel esta aberto e ocupa a mesma quina inferior direita (vira o controle
          de fechar tambem, em vez de ficar escondido atras do painel). */}
      <button
        type="button"
        onClick={toggleChat}
        aria-label={open ? "Fechar chat da JAMILE" : "Abrir chat da JAMILE"}
        className="ai-gradient-bg fixed right-6 bottom-6 z-[60] flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>

      {open ? (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-card shadow-2xl",
            "inset-x-4 bottom-24 top-20",
            "md:inset-auto md:top-auto md:right-6 md:bottom-24 md:h-[560px] md:w-[400px]",
            "lg:h-[45vh] lg:max-h-[720px] lg:min-h-[420px] lg:w-[45vw] lg:max-w-[640px] lg:min-w-[380px]"
          )}
        >
          {!loaded ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Carregando conversa...
            </div>
          ) : (
            <ChatPanel
              key={threadId}
              initialMessages={messages}
              onClose={closeChat}
              onStartNewConversation={startNewConversation}
              className="border-0 shadow-none"
              autoSend={pendingPrefill}
              autoSendContextProposalId={pendingContextProposalId}
              autoSendNeedsCreativeAsset={pendingNeedsCreativeAsset}
              autoSendNeedsFunnelAssets={pendingNeedsFunnelAssets}
              onAutoSent={() => {
                setPendingPrefill(null);
                setPendingContextProposalId(undefined);
                setPendingNeedsCreativeAsset(false);
                setPendingNeedsFunnelAssets(false);
              }}
            />
          )}
        </div>
      ) : null}
    </JamileChatContext.Provider>
  );
}
