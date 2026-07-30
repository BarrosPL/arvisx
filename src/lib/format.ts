/**
 * Formatacao centralizada de moeda/data-hora - existia duplicada (e com dois bugs
 * reais) em varios componentes: moeda fixa em EUR (as contas reais do grupo sao em
 * BRL) e datas sem "timeZone" explicito (toLocaleString("pt-BR") so muda o formato
 * numerico/de data, nao o fuso - sem "timeZone", o servidor usa o proprio fuso dele,
 * que em producao nao e o do Brasil, entao a hora exibida ficava adiantada).
 */
const TIMEZONE = "America/Sao_Paulo";

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString("pt-BR", { timeZone: TIMEZONE, ...options });
}

export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("pt-BR", { timeZone: TIMEZONE, ...options });
}

export function formatTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleTimeString("pt-BR", { timeZone: TIMEZONE, ...options });
}

/** Numero inteiro com separador de milhar (impressoes, alcance, resultados). */
export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** "há 3 min" / "agora" - usado pra deixar explicito na tela quao fresco e o dado
 * mostrado, ja que a coleta e periodica (as plataformas tambem nao entregam numero em
 * tempo real na origem: os relatorios delas tem atraso proprio). */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays}d`;
}
