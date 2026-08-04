import { describe, expect, it } from "vitest";
import { extractPaletteFromPixels, kMeansLab, rgbToLab, labToRgb, saturationOf, type RgbColor } from "./paletteExtraction";

/** RNG determinístico simples (não precisa de qualidade criptográfica, só
 * reprodutibilidade entre execuções do teste) - mesmo espírito do fakeMeasurer de
 * autoFit.test.ts: uma dependência externa trocada por algo previsível nos testes. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("rgbToLab / labToRgb", () => {
  it("faz ida e volta sem perder a cor (dentro de arredondamento)", () => {
    const samples: RgbColor[] = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 11, g: 61, b: 145 }, // #0B3D91, cor real usada em testes anteriores
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
    ];

    for (const rgb of samples) {
      const roundTripped = labToRgb(rgbToLab(rgb));
      expect(roundTripped.r).toBeCloseTo(rgb.r, -1); // tolerância de ~poucos níveis
      expect(roundTripped.g).toBeCloseTo(rgb.g, -1);
      expect(roundTripped.b).toBeCloseTo(rgb.b, -1);
    }
  });

  it("preto tem L=0 e branco tem L=100 (luminância LAB)", () => {
    expect(rgbToLab({ r: 0, g: 0, b: 0 }).l).toBeCloseTo(0, 0);
    expect(rgbToLab({ r: 255, g: 255, b: 255 }).l).toBeCloseTo(100, 0);
  });
});

describe("saturationOf", () => {
  it("cinza/branco/preto têm saturação 0", () => {
    expect(saturationOf({ r: 128, g: 128, b: 128 })).toBe(0);
    expect(saturationOf({ r: 255, g: 255, b: 255 })).toBe(0);
    expect(saturationOf({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it("vermelho puro tem saturação máxima", () => {
    expect(saturationOf({ r: 255, g: 0, b: 0 })).toBeCloseTo(1, 5);
  });
});

describe("kMeansLab", () => {
  it("separa dois grupos bem distintos de cor em dois clusters", () => {
    const reds = Array.from({ length: 40 }, () => rgbToLab({ r: 220, g: 20, b: 20 }));
    const blues = Array.from({ length: 20 }, () => rgbToLab({ r: 20, g: 20, b: 220 }));
    const points = [...reds, ...blues];

    const clusters = kMeansLab(points, 2, 12, seededRandom(42));

    expect(clusters).toHaveLength(2);
    const counts = clusters.map((c) => c.count).sort((a, b) => a - b);
    expect(counts).toEqual([20, 40]);

    // o cluster maior deve ter centroide perto do vermelho (a alto, b baixo-ish);
    // simplesmente confirma que os 2 centroides são visivelmente diferentes um do outro.
    const [c1, c2] = clusters;
    const distance = Math.hypot(c1.centroid.l - c2.centroid.l, c1.centroid.a - c2.centroid.a, c1.centroid.b - c2.centroid.b);
    expect(distance).toBeGreaterThan(30);
  });
});

describe("extractPaletteFromPixels", () => {
  it("devolve o fallback quando não há pixels", () => {
    const result = extractPaletteFromPixels([], seededRandom(1));
    expect(result.primary).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("extrai as 3 cores mais frequentes e saturadas, descartando fundo neutro", () => {
    const pixels: RgbColor[] = [
      ...Array.from({ length: 200 }, () => ({ r: 20, g: 50, b: 150 })), // azul - mais frequente
      ...Array.from({ length: 100 }, () => ({ r: 220, g: 30, b: 30 })), // vermelho
      ...Array.from({ length: 60 }, () => ({ r: 240, g: 200, b: 20 })), // amarelo/dourado
      ...Array.from({ length: 300 }, () => ({ r: 128, g: 128, b: 128 })), // cinza neutro - deve ser descartado (saturação baixa)
    ];

    const result = extractPaletteFromPixels(pixels, seededRandom(7));

    // a cor primária extraída deve ser perceptualmente próxima do azul (o grupo mais
    // frequente entre os saturados) - checa via distância LAB em vez de comparar hex
    // exato, já que k-means não devolve o centroide EXATO da amostra original.
    const primaryLab = rgbToLab(hexToRgb(result.primary));
    const blueLab = rgbToLab({ r: 20, g: 50, b: 150 });
    const distance = Math.hypot(primaryLab.l - blueLab.l, primaryLab.a - blueLab.a, primaryLab.b - blueLab.b);
    expect(distance).toBeLessThan(15);

    // nenhuma das 3 cores devolvidas deve ser o cinza neutro (saturação < 8%)
    for (const hex of [result.primary, result.secondary, result.accent]) {
      const rgb = hexToRgb(hex);
      const isNeutralGray = Math.abs(rgb.r - 128) < 5 && Math.abs(rgb.g - 128) < 5 && Math.abs(rgb.b - 128) < 5;
      expect(isNeutralGray).toBe(false);
    }
  });
});

function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
