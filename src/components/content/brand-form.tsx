"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TagListInput } from "./tag-list-input";

interface BrandData {
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
  isActive: boolean;
}

const DEFAULT_PALETTE = { primary: "#1E3A8A", secondary: "#DBEAFE", accent: "#F59E0B" };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function BrandForm() {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [voiceTone, setVoiceTone] = useState("");
  const [voiceAttributes, setVoiceAttributes] = useState<string[]>([]);
  const [forbiddenTerms, setForbiddenTerms] = useState<string[]>([]);
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [valueProposition, setValueProposition] = useState("");
  const [contentPillars, setContentPillars] = useState<string[]>([]);
  const [legalDisclaimer, setLegalDisclaimer] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/content/brands")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        const brand: BrandData | null = body.brand;
        if (brand) {
          setName(brand.name);
          setLogoUrl(brand.logoUrl);
          setPalette({
            primary: brand.palette.primary,
            secondary: brand.palette.secondary,
            accent: brand.palette.accent,
          });
          setVoiceTone(brand.voiceTone ?? "");
          setVoiceAttributes(brand.voiceAttributes);
          setForbiddenTerms(brand.forbiddenTerms);
          setIndustry(brand.industry ?? "");
          setTargetAudience(brand.targetAudience ?? "");
          setValueProposition(brand.valueProposition ?? "");
          setContentPillars(brand.contentPillars);
          setLegalDisclaimer(brand.legalDisclaimer ?? "");
          setIsActive(brand.isActive);
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogoUpload(file: File) {
    setIsUploadingLogo(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch("/api/content/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, mimeType: file.type }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao enviar logo.");
        return;
      }
      setLogoUrl(body.asset.publicUrl);
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/content/brands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          logoUrl,
          palette,
          voiceTone: voiceTone.trim() || undefined,
          voiceAttributes,
          forbiddenTerms,
          industry: industry.trim() || undefined,
          targetAudience: targetAudience.trim() || undefined,
          valueProposition: valueProposition.trim() || undefined,
          contentPillars,
          legalDisclaimer: legalDisclaimer.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao salvar marca.");
        return;
      }
      setIsActive(true);
      toast.success("Marca salva e ativada.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  const canSave = name.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Sua marca</span>
          <Badge variant={isActive ? "default" : "outline"}>{isActive ? "Ativa" : "Não configurada"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome da marca</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="size-8 rounded object-contain" />
              ) : null}
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isUploadingLogo}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="primary">Cor primária</Label>
            <input
              id="primary"
              type="color"
              value={palette.primary}
              onChange={(event) => setPalette((current) => ({ ...current, primary: event.target.value }))}
              className="h-8 w-full rounded-lg border border-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secondary">Cor secundária</Label>
            <input
              id="secondary"
              type="color"
              value={palette.secondary}
              onChange={(event) => setPalette((current) => ({ ...current, secondary: event.target.value }))}
              className="h-8 w-full rounded-lg border border-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accent">Cor de destaque</Label>
            <input
              id="accent"
              type="color"
              value={palette.accent}
              onChange={(event) => setPalette((current) => ({ ...current, accent: event.target.value }))}
              className="h-8 w-full rounded-lg border border-input"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="voiceTone">Tom de voz</Label>
            <Input
              id="voiceTone"
              value={voiceTone}
              onChange={(event) => setVoiceTone(event.target.value)}
              placeholder="Ex: acolhedor e direto"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="industry">Setor</Label>
            <Input id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Atributos de voz</Label>
            <TagListInput value={voiceAttributes} onChange={setVoiceAttributes} placeholder="Ex: autoridade (Enter pra adicionar)" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Termos proibidos (a IA nunca usa)</Label>
            <TagListInput value={forbiddenTerms} onChange={setForbiddenTerms} placeholder="Ex: garantido (Enter pra adicionar)" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Pilares de conteúdo</Label>
            <TagListInput value={contentPillars} onChange={setContentPillars} placeholder="Ex: educativo (Enter pra adicionar)" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="targetAudience">Público-alvo</Label>
            <Textarea id="targetAudience" value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} rows={2} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="valueProposition">Proposta de valor</Label>
            <Textarea
              id="valueProposition"
              value={valueProposition}
              onChange={(event) => setValueProposition(event.target.value)}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="legalDisclaimer">Rodapé legal obrigatório (opcional)</Label>
            <Textarea
              id="legalDisclaimer"
              value={legalDisclaimer}
              onChange={(event) => setLegalDisclaimer(event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={!canSave || isSaving} className="self-start">
          {isSaving ? "Salvando..." : "Salvar e ativar"}
        </Button>
      </CardContent>
    </Card>
  );
}
