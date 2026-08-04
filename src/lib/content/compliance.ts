import type { Brand } from "@/generated/prisma/client";
import type { GenerationOutput } from "./schema";

/** Padrões de promessa de resultado/prazo (F2.5) - relevante de verdade num produto de
 * imigração/cidadania, onde prometer prazo ou aprovação é tanto enganoso quanto
 * regulatoriamente arriscado. Checagem determinística, não depende do LLM se
 * autopoliciar. Módulo separado de generate.ts (nenhum import de prisma/session) só
 * pra poder ser testado sem carregar next-auth (mesmo motivo de autoFit.ts ser puro). */
const PROMISE_PATTERNS: RegExp[] = [
  /garant\w*/i,
  /100\s?%\s*(de\s*)?(sucesso|aprovaç[ãa]o|certeza)/i,
  /\bem\s+\d+\s*(dias?|semanas?|meses?|anos?)\b/i,
  /sem\s+risco/i,
  /certeza\s+absoluta/i,
];

export function findComplianceViolations(output: GenerationOutput, brand: Pick<Brand, "forbiddenTerms">): string[] {
  const textBlob = [output.hook, output.headline, output.subheadline, ...output.bodyPoints, output.cta, output.caption, output.altText].join(
    "\n",
  );
  const violations: string[] = [];

  for (const term of brand.forbiddenTerms) {
    if (term && textBlob.toLowerCase().includes(term.toLowerCase())) {
      violations.push(`termo proibido usado: "${term}"`);
    }
  }

  for (const pattern of PROMISE_PATTERNS) {
    if (pattern.test(textBlob)) {
      violations.push(`promessa de resultado/prazo (padrão "${pattern.source}")`);
    }
  }

  return violations;
}
