/**
 * `textOnPrimary`/`textOnLight` são CALCULADOS por contraste, nunca escolhidos pelo
 * usuário (F1.2/F1.3 da spec: "calculado por contraste, não escolhido" - garante
 * WCAG AA >= 4.5:1 em 100% dos casos, critério de aceite F1.5).
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contraste WCAG entre duas cores hex - fórmula oficial (L1+0.05)/(L2+0.05). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Preto ou branco, o que der contraste >= 4.5:1 (AA) contra a cor de fundo - preto
 * quase sempre vence em cores claras, branco em cores escuras; em cores médias escolhe
 * o de maior contraste real em vez de supor. */
export function textColorFor(backgroundHex: string): string {
  const contrastWithBlack = contrastRatio(backgroundHex, "#000000");
  const contrastWithWhite = contrastRatio(backgroundHex, "#FFFFFF");
  return contrastWithBlack >= contrastWithWhite ? "#000000" : "#FFFFFF";
}
