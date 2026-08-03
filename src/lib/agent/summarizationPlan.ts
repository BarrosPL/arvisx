import type { Message } from "@/generated/prisma/client";

/**
 * Logica PURA de decidir o que resumir - separada de contextSummary.ts (que chama a
 * OpenAI de verdade) de proposito, pra ser testavel sem precisar de OPENAI_API_KEY no
 * ambiente de teste (importar lib/openai.ts instancia o client no carregamento do
 * modulo e quebra o Vitest sem a chave configurada).
 */

/** Cauda recente sempre enviada palavra por palavra (nunca resumida) - grande o
 * bastante pra manter o "vai e vem" natural de uma conversa em andamento. */
export const KEEP_VERBATIM_MESSAGES = 24;

/** Só dispara o resumo quando o trecho ainda não resumido passar disso - maior que
 * KEEP_VERBATIM_MESSAGES de proposito, senao rodaria uma chamada de resumo em quase
 * toda mensagem (histerese: acumula uma folga antes de agir, em vez de ficar
 * resumindo pouquinho a cada turno). */
export const SUMMARIZE_TRIGGER_MESSAGES = 40;

export interface SummarizationPlan {
  shouldSummarize: boolean;
  /** Mensagens a dobrar no resumo agora (vazio quando shouldSummarize=false). */
  toFold: Message[];
  /** O que continua sendo enviado verbatim pro modelo neste turno. */
  verbatimTail: Message[];
}

/**
 * Decide SE e O QUE resumir, dado o trecho da conversa ainda nao coberto pelo resumo
 * anterior (USER/ASSISTANT, em ordem cronologica).
 */
export function planSummarization(sinceLastSummary: Message[]): SummarizationPlan {
  if (sinceLastSummary.length <= SUMMARIZE_TRIGGER_MESSAGES) {
    return { shouldSummarize: false, toFold: [], verbatimTail: sinceLastSummary };
  }
  const toFold = sinceLastSummary.slice(0, sinceLastSummary.length - KEEP_VERBATIM_MESSAGES);
  const verbatimTail = sinceLastSummary.slice(-KEEP_VERBATIM_MESSAGES);
  return { shouldSummarize: true, toFold, verbatimTail };
}
