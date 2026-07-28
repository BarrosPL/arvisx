/** Rotulo/cor de badge pro status real de veiculacao (Meta effective_status / Google ad_group_ad.status). */
export function adStatusStyle(status: string | null): { label: string; className: string } {
  if (!status) return { label: "—", className: "border-border text-muted-foreground" };
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ENABLED") {
    return {
      label: normalized === "ACTIVE" ? "Ativo" : "Habilitado",
      className: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (normalized.includes("PAUSED")) {
    return { label: "Pausado", className: "border-border text-muted-foreground" };
  }
  if (normalized === "DISAPPROVED" || normalized === "REMOVED" || normalized === "DELETED") {
    return {
      label: normalized === "REMOVED" ? "Removido" : normalized === "DELETED" ? "Excluído" : "Reprovado",
      className: "border-red-500/30 text-red-600 dark:text-red-400",
    };
  }
  return { label: status, className: "border-border text-foreground" };
}
