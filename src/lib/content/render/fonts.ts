import { readFileSync } from "fs";
import path from "path";

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface FontDefinition {
  family: string;
  fileName: string;
  weight: FontWeight;
  style: "normal" | "italic";
}

/** IDs usados em Brand.headingFontId/bodyFontId e nos templates - fontes licenciadas
 * (SIL-OFL, ver risco #9 da spec) auto-hospedadas em public/fonts/, o MESMO arquivo
 * usado no render (nunca uma "parecida" via Google Fonts CDN - garante que o texto
 * sai idêntico sempre, já que agora só existe um render, no servidor). */
export const FONT_REGISTRY: Record<string, FontDefinition> = {
  "inter-regular": { family: "Inter", fileName: "Inter-Regular.ttf", weight: 400, style: "normal" },
  "inter-bold": { family: "Inter", fileName: "Inter-Bold.ttf", weight: 700, style: "normal" },
};

/** "public"/"fonts" como segmentos LITERAIS no path.join (não um caminho completo já
 * montado em FONT_REGISTRY) - só o nome do arquivo varia por fonte. Isso mantém a
 * chamada estaticamente "escopada a uma subpasta", o padrão que o Node File Tracing
 * do Next exige pra não marcar isto como acesso a arquivo dinâmico demais e acabar
 * rastreando o projeto inteiro por engano (achado real: build local emitia o aviso
 * "Encountered unexpected file in NFT list" antes desta mudança). */
export function fontAbsolutePath(fontId: string): string {
  const def = FONT_REGISTRY[fontId];
  if (!def) throw new Error(`Fonte desconhecida: ${fontId}`);
  return path.join(process.cwd(), "public", "fonts", def.fileName);
}

/** Carregado uma vez por processo (module cache do Node) - não reabre o arquivo a
 * cada render. */
const fontDataCache = new Map<string, Buffer>();

/** `name` (não `family`) é o nome do campo que o Satori espera em FontOptions. */
export function loadFontData(fontId: string): { name: string; data: Buffer; weight: FontWeight; style: "normal" | "italic" } {
  const def = FONT_REGISTRY[fontId];
  if (!def) throw new Error(`Fonte desconhecida: ${fontId}`);

  let data = fontDataCache.get(fontId);
  if (!data) {
    data = readFileSync(fontAbsolutePath(fontId));
    fontDataCache.set(fontId, data);
  }

  return { name: def.family, data, weight: def.weight, style: def.style };
}
