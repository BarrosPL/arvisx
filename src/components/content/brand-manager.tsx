"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { BrandWizard } from "./brand-wizard";
import { BrandCard } from "./brand-card";

export interface BrandData {
  id: string;
  name: string;
  logoUrl: string | null;
  palette: { primary: string; secondary: string; accent: string };
  voiceTone: string | null;
  voiceAttributes: string[];
  forbiddenTerms: string[];
  industry: string | null;
  targetAudience: string | null;
  valueProposition: string | null;
  contentPillars: string[];
  legalDisclaimer: string | null;
  primaryGoal: "VENDER" | "CONSTRUIR_AUTORIDADE" | "AUMENTAR_ENGAJAMENTO" | "GERAR_LEADS" | null;
  country: string;
  visualStyleDescription: string | null;
  isActive: boolean;
}

type Mode = { type: "list" } | { type: "create" } | { type: "edit"; brand: BrandData };

export function BrandManager() {
  const [brands, setBrands] = useState<BrandData[] | null>(null);
  const [mode, setMode] = useState<Mode>({ type: "list" });

  async function loadBrands() {
    const response = await fetch("/api/content/brands");
    const body = await response.json();
    setBrands(body.brands ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/content/brands")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setBrands(body.brands ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSaved() {
    setMode({ type: "list" });
    loadBrands();
  }

  if (mode.type === "create") {
    return <BrandWizard existingBrand={null} onClose={() => setMode({ type: "list" })} onSaved={handleSaved} />;
  }
  if (mode.type === "edit") {
    return <BrandWizard existingBrand={mode.brand} onClose={() => setMode({ type: "list" })} onSaved={handleSaved} />;
  }

  if (brands === null) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {brands.length} marca{brands.length === 1 ? "" : "s"}
        </span>
        <Button onClick={() => setMode({ type: "create" })} className="gap-1.5 rounded-full">
          <Plus className="size-4" />
          Nova Marca
        </Button>
      </div>

      {brands.length === 0 ? (
        <EmptyState
          title="Nenhuma marca cadastrada"
          description="Crie sua primeira marca pra começar a gerar conteúdo com IA."
          action={
            <Button onClick={() => setMode({ type: "create" })} className="gap-1.5 rounded-full">
              <Plus className="size-4" />
              Criar primeira marca
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              onEdit={() => setMode({ type: "edit", brand })}
              onChanged={loadBrands}
            />
          ))}
        </div>
      )}
    </div>
  );
}
