"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { BrandForm, type BrandFormValues } from "@/components/brand-form";

export function BrandAdvancedSettings({ initial }: { initial: BrandFormValues }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Settings2 className="size-4" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-medium">Configurações avançadas</span>
          <p className="text-xs text-muted-foreground">
            Nome, status, prioridade no scheduler e firewall de marca.
          </p>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Prioridade no scheduler</strong> define a ordem em
            que a rodada automática de análise visita as marcas — ainda não tem efeito porque o
            scheduler ainda não foi construído.{" "}
            <strong className="text-foreground">Palavras-chave</strong> alimentam o firewall de
            marca: impedem que o agente de IA misture assuntos de marcas diferentes — também só
            entra em ação quando o agente de chat existir.
          </p>
          <BrandForm mode="edit" initial={initial} />
        </div>
      ) : null}
    </div>
  );
}
