import type { Format, Template } from "@/generated/prisma/client";
import type { GenerationOutput } from "../schema";
import type { SceneNode } from "./scene";
import { cloneScene, findSlotNodes } from "./scene";
import { brandTokenValues, resolveBrandTokens } from "./tokens";
import { autoFit, type SlotConstraints } from "./autoFit";
import { createTextMeasurer } from "./textMeasure";
import { fontAbsolutePath } from "./fonts";

/** Só os campos de `GenerationOutput` que são texto simples (nunca `bodyPoints`/
 * `hashtags`, que são array) - os únicos que um slot visual ou um comando `setText`
 * podem apontar pra. Tipo à parte (em vez de `keyof GenerationOutput` direto) pra
 * `generation[field] = value` em revise.ts tipar como atribuição de string, não da
 * união com os campos de array. */
export type TextSlotField = "hook" | "headline" | "subheadline" | "cta";

/** Qual campo da geração (F2.3) preenche qual slot visual do template "capa_simples"
 * (F3.2) - só 1 template/arquétipo nesta rodada, mapeamento fixo aqui mesmo em vez de
 * uma tabela nova no banco (YAGNI até existir um segundo arquétipo de verdade).
 * Reaproveitado por generate.ts (preencher slot) e revise.ts (achar QUE campo de
 * `generation` um comando "setText slotKey=X" deve alterar - a mesma tabela serve pros
 * dois sentidos, já que é 1:1). */
export const SLOT_COPY_SOURCE: Record<string, TextSlotField> = {
  eyebrow: "hook",
  headline: "headline",
  subheadline: "subheadline",
  cta: "cta",
};

/** Fundo efetivo de cada slot no template atual - usado só pelo guard de contraste em
 * revise.ts (F4.3 "contraste < 4.5:1 - aplica, mas avisa"). Hardcoded pro único
 * template que existe hoje (todo slot fica sobre `palette.primary`, exceto o botão de
 * CTA, que tem fundo branco fixo) - quando existir mais de um arquétipo, isto vira um
 * dado do próprio template em vez de uma tabela fixa aqui. */
export const SLOT_BACKGROUND_HEX: Record<string, "primary" | "white"> = {
  eyebrow: "primary",
  headline: "primary",
  subheadline: "primary",
  cta: "white",
};

function fontIdForWeight(weight: unknown): string {
  return Number(weight) >= 700 ? "inter-bold" : "inter-regular";
}

/** Troca os tokens `{{brand.*}}` pelos valores reais da marca e resolve cada slot de
 * texto (`{{slots.*}}` só existe como conceito - na prática é achar o nó pelo
 * `slotKey`, porque autoFit também precisa mutar o `style` desse mesmo nó). Recebe a
 * paleta separada do Brand (não `brand.palette` direto) pra revise.ts poder passar uma
 * paleta com override de `setPalette` sem mutar a marca de verdade. */
export function resolveScene(template: Template, palette: Record<string, string>, format: Format, output: GenerationOutput): SceneNode {
  const scene = cloneScene(template.sceneJson as unknown as SceneNode);
  resolveBrandTokens(scene, brandTokenValues(palette));

  const slots = template.slots as unknown as Record<string, SlotConstraints>;
  const safeArea = format.safeArea as { top: number; bottom: number; left: number; right: number };
  const maxWidth = format.width - safeArea.left - safeArea.right;

  for (const node of findSlotNodes(scene)) {
    const slotKey = node.slotKey!;
    const constraints = slots[slotKey];
    if (!constraints) throw new Error(`Template sem constraints declaradas para o slot "${slotKey}"`);

    const sourceField = SLOT_COPY_SOURCE[slotKey];
    if (!sourceField) throw new Error(`Sem mapeamento de copy gerada para o slot "${slotKey}"`);
    const text = output[sourceField];
    if (typeof text !== "string") throw new Error(`Campo de geração "${sourceField}" não é texto`);

    const style = node.props.style ?? {};
    const measurer = createTextMeasurer(fontAbsolutePath(fontIdForWeight(style.fontWeight)));
    const fit = autoFit(text, constraints, maxWidth, measurer);

    node.props.children = fit.text;
    node.props.style = { ...style, fontSize: fit.fontSize, lineHeight: fit.lineHeight };
  }

  return scene;
}

/** Aplica overrides manuais de estilo (comando `setStyle` da revisão) por cima do que
 * `resolveScene`/autoFit já calcularam - de propósito DEPOIS do autoFit, não antes: se
 * o usuário pediu "aumenta o título", a intenção é que esse valor vença o que o autoFit
 * escolheria sozinho, não o contrário. */
export function applyStyleOverrides(scene: SceneNode, overrides: Record<string, Record<string, number | string>>): void {
  for (const node of findSlotNodes(scene)) {
    const slotKey = node.slotKey!;
    const override = overrides[slotKey];
    if (!override) continue;
    node.props.style = { ...node.props.style, ...override };
  }
}
