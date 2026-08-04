import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { FONT_REGISTRY, loadFontData } from "./fonts";
import type { SceneNode } from "./scene";

/**
 * Único render que existe no sistema (sem F4/canvas, o resultado do servidor É o que
 * o usuário vê) - Satori (JSX-like -> SVG) + resvg (SVG -> PNG). Sem Chromium, sem
 * node-canvas, sem risco de divergência client/server porque não tem "outro lado" pra
 * bater (ver Contexto do plano - achado que trocou a abordagem original da spec).
 */
export async function renderScene(scene: SceneNode, width: number, height: number): Promise<Buffer> {
  const fonts = Object.keys(FONT_REGISTRY).map((id) => loadFontData(id));

  const svg = await satori(scene as never, { width, height, fonts });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}
