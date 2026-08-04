import type { TextMeasurer } from "./textMeasure";

export interface SlotConstraints {
  minFontSize: number;
  maxFontSize: number;
  maxChars: number;
  maxLines: number;
}

export interface AutoFitResult {
  text: string;
  fontSize: number;
  lineHeight: number;
  truncated: boolean;
  overflowWarning: boolean;
}

const FONT_SIZE_STEP = 2;
const REDUCED_LINE_HEIGHT = 0.95;
/** Espaço vertical "de sobra" acima do qual vale a pena aumentar a fonte de novo -
 * evita peça com título pequeno perdido num espaço grande vazio (spec F2.4, passo 3). */
const EXPAND_THRESHOLD = 0.65; // usa <65% das linhas disponíveis = sobrou >35%

/**
 * Algoritmo determinístico da spec (F2.4) - mede com o fontSize declarado, reduz até
 * o mínimo, reduz lineHeight, trunca por palavra, ou expande se sobrar espaço.
 * Recebe o `measurer` de fora (textMeasure.ts em produção, fake determinístico nos
 * testes) - pura no sentido de não fazer I/O nem depender de canvas/DOM diretamente.
 */
export function autoFit(text: string, constraints: SlotConstraints, maxWidth: number, measurer: TextMeasurer): AutoFitResult {
  let fontSize = constraints.maxFontSize;
  let lineHeight = 1;
  let workingText = text;
  let truncated = false;

  // 1-2a: reduz fontSize de 2 em 2px até caber ou até o mínimo.
  while (measurer.lineCount(workingText, fontSize, maxWidth) > constraints.maxLines && fontSize > constraints.minFontSize) {
    fontSize = Math.max(constraints.minFontSize, fontSize - FONT_SIZE_STEP);
  }

  // 2b: se no mínimo ainda não coube, reduz lineHeight.
  if (measurer.lineCount(workingText, fontSize, maxWidth) > constraints.maxLines) {
    lineHeight = REDUCED_LINE_HEIGHT;
  }

  // 2c-2d: se mesmo assim não coube, trunca por palavra + reticências.
  if (measurer.lineCount(workingText, fontSize, maxWidth) > constraints.maxLines) {
    workingText = measurer.truncateToLines(workingText, fontSize, maxWidth, constraints.maxLines);
    truncated = true;
  }

  // 3: sobrou muito espaço vertical - aumenta fontSize até o máximo (nunca depois de
  // truncar - truncar já é sinal de que o slot está no limite, não sobrando espaço).
  if (!truncated) {
    const usedLines = measurer.lineCount(workingText, fontSize, maxWidth);
    if (usedLines / constraints.maxLines < EXPAND_THRESHOLD) {
      while (
        fontSize < constraints.maxFontSize &&
        measurer.lineCount(workingText, fontSize + FONT_SIZE_STEP, maxWidth) <= constraints.maxLines
      ) {
        fontSize += FONT_SIZE_STEP;
      }
    }
  }

  return { text: workingText, fontSize, lineHeight, truncated, overflowWarning: truncated };
}
