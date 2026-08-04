import { openSync, type Font } from "fontkit";

/**
 * Medição real de glifo via fontkit (lê o .ttf direto, sem canvas/DOM) - dá pro
 * autoFit decidir font-size/quebra de linha ANTES de mandar pro Satori, com número
 * real em vez de heurística de "largura média de caractere".
 */
export interface TextMeasurer {
  lineCount(text: string, fontSize: number, maxWidth: number): number;
  truncateToLines(text: string, fontSize: number, maxWidth: number, maxLines: number): string;
}

function textWidth(font: Font, text: string, fontSize: number): number {
  const run = font.layout(text);
  return (run.advanceWidth / font.unitsPerEm) * fontSize;
}

/** Quebra gulosa por palavra (mesmo algoritmo que qualquer motor de texto usa) -
 * devolve as linhas resultantes, não só a contagem, pra truncateToLines reaproveitar. */
function wrapLines(font: Font, text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (textWidth(font, candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

export function createTextMeasurer(fontPath: string): TextMeasurer {
  const font = openSync(fontPath) as Font;

  return {
    lineCount(text, fontSize, maxWidth) {
      return wrapLines(font, text, fontSize, maxWidth).length;
    },
    truncateToLines(text, fontSize, maxWidth, maxLines) {
      const lines = wrapLines(font, text, fontSize, maxWidth);
      if (lines.length <= maxLines) return text;

      const kept = lines.slice(0, maxLines);
      const last = kept[kept.length - 1];
      const words = last.split(/\s+/);
      // Tira palavra por palavra do fim da última linha até "... " caber na largura.
      while (words.length > 0 && textWidth(font, `${words.join(" ")}…`, fontSize) > maxWidth) {
        words.pop();
      }
      kept[kept.length - 1] = `${words.join(" ")}…`;
      return kept.join(" ");
    },
  };
}
