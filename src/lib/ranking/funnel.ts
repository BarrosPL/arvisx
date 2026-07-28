export type FunnelStage = "TOPO" | "MEIO" | "FUNDO";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const TOPO_KEYWORDS = ["frio", "prospeccao", "descoberta", "awareness", "alcance", "novo publico"];
const MEIO_KEYWORDS = ["morno", "consideracao", "engajamento", "trafego"];
const FUNDO_KEYWORDS = ["quente", "conversao", "remarketing", "retargeting", "carrinho", "lead quente"];

/**
 * Infere o estagio de funil (topo/meio/fundo) pelo nome da campanha, comparando contra
 * palavras-chave conhecidas da nomenclatura real do Renan (ex: "[MORNO E QUENTE]").
 * Retorna null quando o nome nao bate com nenhuma palavra-chave - "nao classificado" e
 * melhor do que arriscar um palpite errado.
 */
export function classifyFunnelStage(campaignName: string | null): FunnelStage | null {
  if (!campaignName) return null;
  const normalized = normalize(campaignName);

  const matchesFundo = FUNDO_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const matchesMeio = MEIO_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const matchesTopo = TOPO_KEYWORDS.some((keyword) => normalized.includes(keyword));

  // Nomes como "[MORNO E QUENTE]" citam mais de um estagio - prioriza o mais avancado
  // no funil (fundo > meio > topo), que e o que mais importa pra decisao de acao.
  if (matchesFundo) return "FUNDO";
  if (matchesMeio) return "MEIO";
  if (matchesTopo) return "TOPO";
  return null;
}
