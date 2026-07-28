"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RunAnalysisButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  async function handleClick() {
    setIsRunning(true);
    try {
      const response = await fetch("/api/scheduler/run-now", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao rodar a análise.");
        return;
      }
      toast.success("Análise concluída.");
      router.refresh();
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full shrink-0"
      disabled={isRunning}
      onClick={handleClick}
    >
      <RefreshCw className={isRunning ? "animate-spin" : ""} />
      {isRunning ? "Analisando..." : "Analisar agora"}
    </Button>
  );
}
