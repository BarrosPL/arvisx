"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Atualiza os numeros do dashboard sob demanda - dispara so a COLETA (metricas de
 * campanha), sem ranking/proposta/IA. Nao confundir com RunAnalysisButton, que roda a
 * analise completa e cara. Os dados tambem se atualizam sozinhos a cada 15min pelo
 * ciclo de coleta; este botao e pra quando o usuario quer forcar antes disso.
 */
export function RefreshDataButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  async function handleClick() {
    setIsRunning(true);
    try {
      const response = await fetch("/api/collect/run-now", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao atualizar os dados.");
        return;
      }
      if (body.skipped) {
        toast.info("Uma atualização já estava em andamento.");
      } else {
        const notes = [
          body.errors > 0 ? `${body.errors} conta(s) com erro` : null,
          body.throttled > 0 ? `${body.throttled} adiada(s) por limite da Meta` : null,
        ].filter(Boolean);
        toast.success(notes.length > 0 ? `Dados atualizados (${notes.join(", ")}).` : "Dados atualizados.");
      }
      router.refresh();
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" disabled={isRunning} onClick={handleClick}>
      <RefreshCw className={isRunning ? "size-3 animate-spin" : "size-3"} />
      {isRunning ? "Atualizando..." : "Atualizar"}
    </Button>
  );
}
