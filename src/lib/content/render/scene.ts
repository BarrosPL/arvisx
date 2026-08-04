/**
 * Árvore tipo JSX/React que o Satori consome ({type,props:{style,children}}) - não é
 * Fabric.js nem nenhum formato de canvas, porque não existe mais canvas nenhum (sem
 * F4, sem client editável). `slotKey` marca um nó de texto como alvo de resolução de
 * copy (F1.4 "regra do token", adaptado: aqui é achar o nó pelo slotKey em vez de
 * substituir string, porque o autoFit também precisa mutar o `style` desse mesmo nó).
 */
export interface SceneNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: SceneNode[] | string;
    src?: string;
  };
  slotKey?: string;
  // F4.3 da spec ("Objeto com brandLocked: true - rejeita e explica ao usuário") - nenhum
  // slot do template atual usa isto ainda (nenhum logo/disclaimer no arquétipo
  // "capa_simples"), mas o guard em revise.ts já honra a flag pra quando um template
  // com elemento fixo existir.
  brandLocked?: boolean;
}

/** Percorre a árvore e devolve todo nó com slotKey (não recursa dentro de um nó já
 * encontrado - um slot não contém outro slot). */
export function findSlotNodes(node: SceneNode, acc: SceneNode[] = []): SceneNode[] {
  if (node.slotKey) {
    acc.push(node);
    return acc;
  }
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) findSlotNodes(child, acc);
  }
  return acc;
}

/** Clone profundo simples (a cena é só JSON puro - objetos/arrays/strings/números). */
export function cloneScene<T>(scene: T): T {
  return JSON.parse(JSON.stringify(scene));
}
