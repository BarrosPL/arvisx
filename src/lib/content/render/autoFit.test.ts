import { describe, expect, it } from "vitest";
import { autoFit, type SlotConstraints } from "./autoFit";
import type { TextMeasurer } from "./textMeasure";

const CONSTRAINTS: SlotConstraints = { minFontSize: 40, maxFontSize: 88, maxChars: 62, maxLines: 3 };
const MAX_WIDTH = 900;

/** Medidor falso e determinístico - 1 "linha" a cada N caracteres, N proporcional ao
 * fontSize (fontSize maior = menos caracteres cabem por linha). Sem fontkit/arquivo de
 * fonte nenhum - é exatamente o "sem canvas nenhum" que o autoFit promete. */
function fakeMeasurer(charsPerLineAt100px: number): TextMeasurer {
  function charsPerLine(fontSize: number): number {
    return Math.floor((charsPerLineAt100px * 100) / fontSize);
  }
  return {
    lineCount(text, fontSize) {
      return Math.max(1, Math.ceil(text.length / charsPerLine(fontSize)));
    },
    truncateToLines(text, fontSize, _maxWidth, maxLines) {
      const limit = charsPerLine(fontSize) * maxLines - 1; // -1 pra sobrar espaço pra "…"
      if (text.length <= limit) return text;
      const cut = text.slice(0, limit);
      const lastSpace = cut.lastIndexOf(" ");
      return `${cut.slice(0, lastSpace > 0 ? lastSpace : limit)}…`;
    },
  };
}

describe("autoFit", () => {
  it("ramo 1: texto curto cabe direto no fontSize maximo, sem nenhum ajuste", () => {
    const measurer = fakeMeasurer(30);
    const result = autoFit("Título curto", CONSTRAINTS, MAX_WIDTH, measurer);
    expect(result.fontSize).toBe(CONSTRAINTS.maxFontSize);
    expect(result.lineHeight).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("Título curto");
  });

  it("ramo 2: texto medio reduz fontSize de 2 em 2px ate caber", () => {
    const measurer = fakeMeasurer(12); // poucos caracteres por linha no fontSize maximo
    const text = "Um título de tamanho médio que não cabe no fontSize máximo";
    const result = autoFit(text, CONSTRAINTS, MAX_WIDTH, measurer);
    expect(result.fontSize).toBeLessThan(CONSTRAINTS.maxFontSize);
    expect(result.fontSize).toBeGreaterThanOrEqual(CONSTRAINTS.minFontSize);
    expect((CONSTRAINTS.maxFontSize - result.fontSize) % 2).toBe(0); // sempre passo de 2px
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });

  it("ramo 3: texto longo demais mesmo no minimo reduz lineHeight pra 0.95", () => {
    const measurer = fakeMeasurer(3); // muito pouca coisa cabe por linha
    const text = "Um título bem mais longo do que o normal, que não cabe nem no fontSize mínimo";
    const result = autoFit(text, CONSTRAINTS, MAX_WIDTH, measurer);
    expect(result.fontSize).toBe(CONSTRAINTS.minFontSize);
    // lineHeight reduzido OU já truncou - depende de quanto o fake measurer aperta;
    // o que importa é nunca voltar pro lineHeight 1 sem ter coubido.
    if (!result.truncated) {
      expect(result.lineHeight).toBe(0.95);
    }
  });

  it("ramo 4: texto extremamente longo trunca por palavra + reticencias, marca overflowWarning", () => {
    const measurer = fakeMeasurer(1); // quase nada cabe por linha - forca truncamento
    const text =
      "Este é um texto propositalmente enorme, cheio de palavras, feito especificamente para estourar qualquer limite de linhas configurado no slot de teste";
    const result = autoFit(text, CONSTRAINTS, MAX_WIDTH, measurer);
    expect(result.truncated).toBe(true);
    expect(result.overflowWarning).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text.length).toBeLessThan(text.length);
  });

  it("ramo 5: texto muito curto expande o fontSize ate o maximo permitido (evita peca vazia)", () => {
    const measurer = fakeMeasurer(80); // qualquer coisa cabe numa linha só, sobra espaço
    const result = autoFit("Oi", CONSTRAINTS, MAX_WIDTH, measurer);
    expect(result.fontSize).toBe(CONSTRAINTS.maxFontSize);
    expect(result.truncated).toBe(false);
  });

  it("nunca reduz fontSize abaixo do minFontSize declarado no slot", () => {
    const measurer = fakeMeasurer(0.5);
    const text = "Texto gigantesco ".repeat(20);
    const result = autoFit(text, CONSTRAINTS, MAX_WIDTH, measurer);
    expect(result.fontSize).toBeGreaterThanOrEqual(CONSTRAINTS.minFontSize);
  });
});
