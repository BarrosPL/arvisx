import type { SceneNode } from "./scene";

type TokenValues = Record<string, string>;

/** `Brand.palette` (Json) -> mapa "palette.primary" -> "#RRGGBB" etc, no formato que
 * resolveBrandTokens espera. */
export function brandTokenValues(palette: Record<string, string>): TokenValues {
  const values: TokenValues = {};
  for (const [key, value] of Object.entries(palette)) {
    values[`palette.${key}`] = value;
  }
  return values;
}

/**
 * Troca `"{{brand.X}}"` pelo valor real em `tokenValues["X"]` (F1.4 "regra do token" -
 * o token precisa ser o valor INTEIRO da propriedade, nunca interpolado dentro de uma
 * string maior, senão vira um "{{...}}" literal no PNG em vez de sumir). Muta a árvore
 * no lugar - sempre chamado sobre uma cena já clonada (cloneScene), nunca sobre o
 * `Template.sceneJson` original guardado no banco.
 */
export function resolveBrandTokens(node: SceneNode, tokenValues: TokenValues): SceneNode {
  const style = node.props.style;
  if (style) {
    for (const [key, value] of Object.entries(style)) {
      if (typeof value !== "string") continue;
      const match = /^\{\{brand\.(.+)\}\}$/.exec(value);
      if (!match) continue;
      const resolved = tokenValues[match[1]];
      if (resolved === undefined) throw new Error(`Token de marca desconhecido: ${value}`);
      style[key] = resolved;
    }
  }

  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) resolveBrandTokens(child, tokenValues);
  }

  return node;
}
