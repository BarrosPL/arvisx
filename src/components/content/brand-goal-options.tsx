import { Heart, Sparkles, TrendingUp, UserPlus } from "lucide-react";

/** Compartilhado entre o wizard (passo "Objetivo") e o card da lista (tag de
 * objetivo) - único lugar com os rótulos em português dos 4 valores de `BrandGoal`. */
export const GOAL_OPTIONS = [
  { value: "VENDER", label: "Vender mais produtos/serviços", description: "Aumentar vendas e conversões", icon: TrendingUp },
  { value: "CONSTRUIR_AUTORIDADE", label: "Construir autoridade", description: "Se tornar referência no seu nicho", icon: Sparkles },
  { value: "AUMENTAR_ENGAJAMENTO", label: "Aumentar engajamento", description: "Criar comunidade ativa", icon: Heart },
  { value: "GERAR_LEADS", label: "Gerar leads qualificados", description: "Captar potenciais clientes", icon: UserPlus },
] as const;

export type BrandGoalValue = (typeof GOAL_OPTIONS)[number]["value"];

export function goalLabel(value: BrandGoalValue | null): string | null {
  return GOAL_OPTIONS.find((option) => option.value === value)?.label ?? null;
}
