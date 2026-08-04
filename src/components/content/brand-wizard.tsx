"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, ChevronDown, ChevronLeft, Fingerprint, Palette, Sparkles, Target, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagListInput } from "./tag-list-input";
import { GOAL_OPTIONS, type BrandGoalValue } from "./brand-goal-options";
import type { BrandData } from "./brand-manager";

const DEFAULT_PALETTE = { primary: "#1E3A8A", secondary: "#DBEAFE", accent: "#F59E0B" };

const VOICE_ATTRIBUTE_OPTIONS = [
  "Descontraído",
  "Profissional",
  "Inspirador",
  "Educativo",
  "Divertido",
  "Acolhedor",
  "Direto",
  "Sofisticado",
  "Amigável",
  "Motivacional",
];

const PALETTE_PRESETS: { name: string; palette: { primary: string; secondary: string; accent: string } }[] = [
  { name: "Menta", palette: { primary: "#0F9B8E", secondary: "#6EE7DD", accent: "#F0FDF9" } },
  { name: "Frutas Vermelhas", palette: { primary: "#B91C4C", secondary: "#F98CA8", accent: "#FCE7EE" } },
  { name: "Oceano", palette: { primary: "#1D4ED8", secondary: "#7DD3FC", accent: "#EFF6FF" } },
  { name: "Floresta", palette: { primary: "#166534", secondary: "#86EFAC", accent: "#F0FDF4" } },
  { name: "Pôr do Sol", palette: { primary: "#C2410C", secondary: "#FDBA74", accent: "#FFF7ED" } },
  { name: "Ametista", palette: { primary: "#6D28D9", secondary: "#C4B5FD", accent: "#F5F3FF" } },
];

const STEPS = [
  { key: "objetivo", label: "Objetivo", icon: Target },
  { key: "marca", label: "Marca", icon: Building2 },
  { key: "publico", label: "Público", icon: Users },
  { key: "identidade", label: "Identidade", icon: Fingerprint },
  { key: "estilo", label: "Estilo", icon: Palette },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
type Phase = "quickstart" | StepKey;

interface WizardFields {
  name: string;
  industry: string;
  country: string;
  valueProposition: string;
  targetAudience: string;
  primaryGoal: BrandGoalValue | null;
  voiceAttributes: string[];
  forbiddenTerms: string[];
  contentPillars: string[];
  legalDisclaimer: string;
  logoUrl: string | null;
  palette: { primary: string; secondary: string; accent: string };
  visualStyleDescription: string;
}

function fieldsFromBrand(brand: BrandData | null): WizardFields {
  if (!brand) {
    return {
      name: "",
      industry: "",
      country: "BR",
      valueProposition: "",
      targetAudience: "",
      primaryGoal: null,
      voiceAttributes: [],
      forbiddenTerms: [],
      contentPillars: [],
      legalDisclaimer: "",
      logoUrl: null,
      palette: DEFAULT_PALETTE,
      visualStyleDescription: "",
    };
  }
  return {
    name: brand.name,
    industry: brand.industry ?? "",
    country: brand.country,
    valueProposition: brand.valueProposition ?? "",
    targetAudience: brand.targetAudience ?? "",
    primaryGoal: brand.primaryGoal,
    voiceAttributes: brand.voiceAttributes,
    forbiddenTerms: brand.forbiddenTerms,
    contentPillars: brand.contentPillars,
    legalDisclaimer: brand.legalDisclaimer ?? "",
    logoUrl: brand.logoUrl,
    palette: { primary: brand.palette.primary, secondary: brand.palette.secondary, accent: brand.palette.accent },
    visualStyleDescription: brand.visualStyleDescription ?? "",
  };
}

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

/** Seção recolhível "Configurações avançadas" - mesmo texto/conceito dos prints de
 * referência ("ajudam a IA a criar conteúdo ainda melhor, mas você pode preencher
 * depois") - hospeda os campos que não têm passo próprio no wizard de referência
 * (termos proibidos, pilares de conteúdo, rodapé legal) sem inventar um 7º passo. */
function AdvancedSettings({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
      >
        <span className="text-muted-foreground">Configurações avançadas - opcional, ajuda a IA a criar conteúdo ainda melhor</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="flex flex-col gap-3 border-t px-3 py-3">{children}</div> : null}
    </div>
  );
}

export function BrandWizard({
  existingBrand,
  onClose,
  onSaved,
}: {
  existingBrand: BrandData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(existingBrand ? "objetivo" : "quickstart");
  const [fields, setFields] = useState<WizardFields>(() => fieldsFromBrand(existingBrand));
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customizingColors, setCustomizingColors] = useState(existingBrand !== null);

  function set<K extends keyof WizardFields>(key: K, value: WizardFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleExtractFromUpload(file: File) {
    setIsExtracting(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch("/api/content/brands/extract-palette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, mimeType: file.type }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao analisar a imagem.");
        return;
      }
      set("palette", body.palette);
      setCustomizingColors(true);
      toast.success("Cores identificadas a partir da imagem - revise no passo Estilo.");
      setPhase("objetivo");
    } finally {
      setIsExtracting(false);
    }
  }

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
      set("logoUrl", body.asset.publicUrl);
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleDescribeStyle() {
    setIsDescribing(true);
    try {
      const response = await fetch("/api/content/brands/describe-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palette: fields.palette, voiceAttributes: fields.voiceAttributes, industry: fields.industry || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao gerar descrição.");
        return;
      }
      set("visualStyleDescription", body.description);
    } finally {
      setIsDescribing(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const payload = {
        name: fields.name.trim(),
        logoUrl: fields.logoUrl,
        palette: fields.palette,
        voiceAttributes: fields.voiceAttributes,
        forbiddenTerms: fields.forbiddenTerms,
        industry: fields.industry.trim() || undefined,
        targetAudience: fields.targetAudience.trim() || undefined,
        valueProposition: fields.valueProposition.trim() || undefined,
        contentPillars: fields.contentPillars,
        legalDisclaimer: fields.legalDisclaimer.trim() || undefined,
        primaryGoal: fields.primaryGoal,
        country: fields.country.trim().toUpperCase() || "BR",
        visualStyleDescription: fields.visualStyleDescription.trim() || undefined,
      };

      const response = existingBrand
        ? await fetch(`/api/content/brands/${existingBrand.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/content/brands", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao salvar marca.");
        return;
      }
      toast.success(existingBrand ? "Marca atualizada." : "Marca criada e ativada.");
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  const stepIndex = phase === "quickstart" ? -1 : STEPS.findIndex((s) => s.key === phase);
  const isLastStep = phase === "estilo";
  const canContinue =
    phase !== "marca" || fields.name.trim().length > 0; // único campo realmente obrigatório é o nome

  function goNext() {
    if (isLastStep) {
      handleSave();
      return;
    }
    const nextIndex = stepIndex + 1;
    setPhase(STEPS[nextIndex].key);
  }

  function goBack() {
    if (stepIndex <= 0) {
      if (!existingBrand) setPhase("quickstart");
      return;
    }
    setPhase(STEPS[stepIndex - 1].key);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{existingBrand ? "Editar marca" : "Nova marca"}</p>
          <p className="text-xs text-muted-foreground">{phase === "quickstart" ? "Vamos agilizar" : `Passo ${stepIndex + 1} de ${STEPS.length}`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
      </div>

      {phase !== "quickstart" ? (
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`flex size-9 items-center justify-center rounded-full ${
                    active || done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <span className={`text-[11px] ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Passo 0: Vamos agilizar */}
      {phase === "quickstart" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </div>
            <p className="text-lg font-semibold">Vamos agilizar!</p>
            <p className="text-sm text-muted-foreground">Envie um post que você já publicou e a IA identifica as cores da sua marca</p>
          </div>

          <label className="flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <Upload className="size-4 text-primary" />
              <span className="text-sm font-medium">Enviar um post que você já publicou</span>
            </div>
            <span className="text-xs text-muted-foreground">A IA analisa a imagem e identifica as cores principais da sua marca</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={isExtracting}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleExtractFromUpload(file);
              }}
            />
            {isExtracting ? <span className="text-xs text-primary">Analisando imagem...</span> : null}
          </label>

          <button
            type="button"
            onClick={() => setPhase("objetivo")}
            className="flex flex-col gap-1 rounded-lg border border-dashed p-4 text-left transition-colors hover:bg-muted/50"
          >
            <span className="text-sm font-medium">Preencher manualmente</span>
            <span className="text-xs text-muted-foreground">Sem atalho - preenche cada passo do zero</span>
          </button>
        </div>
      ) : null}

      {/* Passo 1: Objetivo */}
      {phase === "objetivo" ? (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Qual seu principal objetivo?</p>
            <p className="text-sm text-muted-foreground">Vamos começar entendendo sua meta principal</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {GOAL_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = fields.primaryGoal === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => set("primaryGoal", option.value)}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                    selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`size-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Passo 2: Marca */}
      {phase === "marca" ? (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Conte sobre sua marca</p>
            <p className="text-sm text-muted-foreground">Informações básicas para personalizarmos seu conteúdo</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-name">Nome da marca</Label>
            <Input id="wizard-name" value={fields.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wizard-country">País</Label>
              <Input id="wizard-country" value={fields.country} maxLength={2} onChange={(e) => set("country", e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wizard-industry">Setor</Label>
              <Input id="wizard-industry" value={fields.industry} onChange={(e) => set("industry", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-value-prop">O que a marca faz?</Label>
            <Textarea
              id="wizard-value-prop"
              rows={3}
              value={fields.valueProposition}
              onChange={(e) => set("valueProposition", e.target.value)}
              placeholder="Descreva em poucas frases o negócio, produto ou serviço"
            />
          </div>
          <AdvancedSettings>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wizard-legal">Rodapé legal obrigatório</Label>
              <Textarea
                id="wizard-legal"
                rows={2}
                value={fields.legalDisclaimer}
                onChange={(e) => set("legalDisclaimer", e.target.value)}
              />
            </div>
          </AdvancedSettings>
        </div>
      ) : null}

      {/* Passo 3: Público */}
      {phase === "publico" ? (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Quem é seu público-alvo?</p>
            <p className="text-sm text-muted-foreground">Descreva as pessoas que você quer alcançar</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-audience">Quem é o cliente ideal?</Label>
            <Textarea
              id="wizard-audience"
              rows={4}
              value={fields.targetAudience}
              onChange={(e) => set("targetAudience", e.target.value)}
              placeholder="Idade, gênero, localização, profissão, estilo de vida"
            />
          </div>
          <AdvancedSettings>
            <div className="flex flex-col gap-1.5">
              <Label>Pilares de conteúdo</Label>
              <TagListInput value={fields.contentPillars} onChange={(v) => set("contentPillars", v)} placeholder="Ex: educativo (Enter pra adicionar)" />
            </div>
          </AdvancedSettings>
        </div>
      ) : null}

      {/* Passo 4: Identidade */}
      {phase === "identidade" ? (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Qual a personalidade da sua marca?</p>
            <p className="text-sm text-muted-foreground">Como você quer que as pessoas percebam sua marca?</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Tom de voz - selecione os que melhor representam sua marca</Label>
            <div className="flex flex-wrap gap-2">
              {VOICE_ATTRIBUTE_OPTIONS.map((attribute) => {
                const selected = fields.voiceAttributes.includes(attribute);
                return (
                  <button
                    key={attribute}
                    type="button"
                    onClick={() =>
                      set(
                        "voiceAttributes",
                        selected ? fields.voiceAttributes.filter((a) => a !== attribute) : [...fields.voiceAttributes, attribute],
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {attribute}
                  </button>
                );
              })}
            </div>
          </div>
          <AdvancedSettings>
            <div className="flex flex-col gap-1.5">
              <Label>Termos proibidos (a IA nunca usa)</Label>
              <TagListInput value={fields.forbiddenTerms} onChange={(v) => set("forbiddenTerms", v)} placeholder="Ex: garantido (Enter pra adicionar)" />
            </div>
          </AdvancedSettings>
        </div>
      ) : null}

      {/* Passo 5: Estilo */}
      {phase === "estilo" ? (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Estilo visual da marca</p>
            <p className="text-sm text-muted-foreground">Defina a identidade visual para suas criações</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Logo da marca (opcional)</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 hover:bg-muted/50">
              {fields.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fields.logoUrl} alt="Logo" className="size-10 rounded object-contain" />
              ) : (
                <Upload className="size-5 text-muted-foreground" />
              )}
              <span className="text-sm text-muted-foreground">{isUploadingLogo ? "Enviando..." : fields.logoUrl ? "Logo enviada - trocar" : "Enviar logo"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={isUploadingLogo}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Cores da marca</Label>
              <button
                type="button"
                onClick={() => setCustomizingColors((v) => !v)}
                className={`rounded-full px-2.5 py-1 text-xs ${customizingColors ? "bg-primary text-primary-foreground" : "border"}`}
              >
                Personalizar
              </button>
            </div>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">Cores atuais:</span>
              {(["primary", "secondary", "accent"] as const).map((role) => (
                <span key={role} className="flex items-center gap-1.5 text-xs">
                  <span className="size-4 rounded-full border" style={{ backgroundColor: fields.palette[role] }} />
                </span>
              ))}
            </div>

            {customizingColors ? (
              <div className="grid grid-cols-3 gap-3">
                {(["primary", "secondary", "accent"] as const).map((role) => (
                  <div key={role} className="flex flex-col gap-1.5">
                    <Label htmlFor={`wizard-${role}`} className="text-xs capitalize">
                      {role === "primary" ? "Primária" : role === "secondary" ? "Secundária" : "Destaque"}
                    </Label>
                    <input
                      id={`wizard-${role}`}
                      type="color"
                      value={fields.palette[role]}
                      onChange={(e) => set("palette", { ...fields.palette, [role]: e.target.value })}
                      className="h-9 w-full rounded-lg border border-input"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {PALETTE_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => set("palette", preset.palette)}
                    className="flex flex-col items-center gap-1.5 rounded-lg border p-2 hover:bg-muted/50"
                  >
                    <div className="flex gap-1">
                      {Object.values(preset.palette).map((hex, i) => (
                        <span key={i} className="size-4 rounded-full border" style={{ backgroundColor: hex }} />
                      ))}
                    </div>
                    <span className="text-[11px]">{preset.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="wizard-visual-style">Descrição do estilo visual</Label>
              <Button type="button" variant="ghost" size="sm" onClick={handleDescribeStyle} disabled={isDescribing}>
                {isDescribing ? "Gerando..." : "Gerar com IA"}
              </Button>
            </div>
            <Textarea
              id="wizard-visual-style"
              rows={2}
              value={fields.visualStyleDescription}
              onChange={(e) => set("visualStyleDescription", e.target.value)}
              placeholder="A IA pode gerar essa descrição baseada na paleta e no tom - edite livremente"
            />
          </div>
        </div>
      ) : null}

      {phase !== "quickstart" ? (
        <div className="flex items-center justify-between border-t pt-4">
          <Button type="button" variant="ghost" onClick={goBack} className="gap-1">
            <ChevronLeft className="size-4" />
            Voltar
          </Button>
          <Button type="button" onClick={goNext} disabled={!canContinue || isSaving} className="rounded-full">
            {isLastStep ? (isSaving ? "Salvando..." : existingBrand ? "Salvar alterações" : "Salvar e ativar") : "Continuar"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
