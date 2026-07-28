/**
 * Fonte de verdade das 7 marcas ativas do grupo ARVISX, portada do contrato de marca
 * do prompt da JAMILE (n8n). Usada pelo seed inicial e, na Fase 2, pelo brand firewall
 * (lib/brands/firewall.ts) para classificar conteudo por marca.
 *
 * topicKeywords: temas que pertencem a marca.
 * excludedKeywords: temas conhecidos de OUTRAS marcas que nunca devem aparecer aqui.
 */
export interface BrandSeed {
  slug: string;
  name: string;
  priorityOrder: number;
  topicKeywords: string[];
  excludedKeywords: string[];
}

export const BRAND_REGISTRY: BrandSeed[] = [
  {
    slug: "vne",
    name: "Você na Europa",
    priorityOrder: 1,
    topicKeywords: [
      "cidadania italiana",
      "cidadania portuguesa",
      "cidadania espanhola",
      "nacionalidade",
      "residencia europeia",
      "aima",
      "legalizacao migratoria",
    ],
    excludedKeywords: [
      "curso",
      "mentoria",
      "pos-graduacao",
      "hotmart",
      "kiwify",
      "visto de estudo",
      "visto de trabalho",
      "validacao de diploma",
      "revalidacao profissional",
      "seguro",
      "consorcio",
      "viagem premium",
      "agencia de ia",
    ],
  },
  {
    slug: "renan",
    name: "Renan Perrotti",
    priorityOrder: 2,
    topicKeywords: ["curso", "mentoria", "pos-graduacao", "livro", "imersao", "marca pessoal"],
    excludedKeywords: [
      "cidadania italiana",
      "cidadania portuguesa",
      "cidadania espanhola",
      "visto de estudo",
      "visto de trabalho",
      "validacao de diploma",
      "seguro",
      "consorcio",
      "viagem premium",
    ],
  },
  {
    slug: "vdv",
    name: "Vem de Visto",
    priorityOrder: 3,
    topicKeywords: [
      "visto",
      "validacao de diploma",
      "revalidacao profissional",
      "estudo",
      "trabalho",
      "nomade digital",
    ],
    excludedKeywords: [
      "curso",
      "mentoria",
      "pos-graduacao",
      "hotmart",
      "kiwify",
      "cidadania italiana",
      "cidadania portuguesa",
      "cidadania espanhola",
      "nacionalidade",
      "seguro",
      "consorcio",
      "viagem premium",
      "agencia de ia",
    ],
  },
  {
    slug: "arvisx",
    name: "ARVISX",
    priorityOrder: 4,
    topicKeywords: ["ia", "automacao", "funil", "marketing", "agencia", "crm"],
    excludedKeywords: [
      "cidadania italiana",
      "cidadania portuguesa",
      "cidadania espanhola",
      "visto de estudo",
      "validacao de diploma",
      "curso",
      "mentoria",
      "pos-graduacao",
      "seguro",
      "consorcio",
      "viagem premium",
    ],
  },
  {
    slug: "nesso",
    name: "Nesso Viaggi",
    priorityOrder: 5,
    topicKeywords: ["viagem", "turismo", "roteiro", "italia", "vinicola"],
    excludedKeywords: [
      "cidadania",
      "nacionalidade",
      "visto de estudo",
      "validacao de diploma",
      "curso",
      "mentoria",
      "hotmart",
      "kiwify",
      "seguro",
      "consorcio",
      "agencia de ia",
    ],
  },
  {
    slug: "alvance",
    name: "Alvance",
    priorityOrder: 6,
    topicKeywords: ["seguro", "consorcio", "protecao patrimonial", "financeiro"],
    excludedKeywords: [
      "cidadania",
      "nacionalidade",
      "visto de estudo",
      "validacao de diploma",
      "curso",
      "mentoria",
      "hotmart",
      "kiwify",
      "viagem premium",
      "agencia de ia",
    ],
  },
  {
    slug: "psa",
    name: "Perrotti Sociedade de Advogados",
    priorityOrder: 7,
    topicKeywords: ["advocacia institucional", "empresarial", "contrato", "contencioso"],
    excludedKeywords: [
      "curso",
      "mentoria",
      "hotmart",
      "kiwify",
      "visto de estudo",
      "validacao de diploma",
      "seguro",
      "consorcio",
      "viagem premium",
      "agencia de ia",
    ],
  },
];
