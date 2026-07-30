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
