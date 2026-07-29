"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_STATUS_LABEL } from "@/lib/brands/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export interface BrandFormValues {
  id?: string;
  slug: string;
  name: string;
  status?: "ONBOARDING" | "ACTIVE" | "PAUSED";
  priorityOrder: number;
  topicKeywords: string[];
  excludedKeywords: string[];
}

function joinKeywords(keywords: string[]) {
  return keywords.join(", ");
}

function splitKeywords(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function BrandForm({ mode, initial }: { mode: "create" | "edit"; initial: BrandFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [topicKeywordsText, setTopicKeywordsText] = useState(joinKeywords(initial.topicKeywords));
  const [excludedKeywordsText, setExcludedKeywordsText] = useState(
    joinKeywords(initial.excludedKeywords)
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const payload = {
      name: values.name,
      priorityOrder: values.priorityOrder,
      topicKeywords: splitKeywords(topicKeywordsText),
      excludedKeywords: splitKeywords(excludedKeywordsText),
      ...(mode === "edit" ? { status: values.status } : {}),
    };

    try {
      const response = await fetch(
        mode === "create" ? "/api/brands" : `/api/brands/${values.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "create" ? { slug: values.slug, ...payload } : payload),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar a marca.");
        return;
      }

      const body = await response.json();
      const slug = body.brand?.slug ?? values.slug;
      router.push(`/brands/${slug}`);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  const topicKeywordsCount = splitKeywords(topicKeywordsText).length;
  const excludedKeywordsCount = splitKeywords(excludedKeywordsText).length;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      <FormSection
        title="Identificação"
        description={
          mode === "create"
            ? "Nome e identificador único da marca."
            : "Nome e status atual da marca."
        }
      >
        {mode === "create" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={values.slug}
              onChange={(event) =>
                setValues((current) => ({ ...current, slug: event.target.value }))
              }
              placeholder="ex: nova-marca"
              required
            />
            <p className="text-xs text-muted-foreground">
              Usado na URL da marca. Só letras minúsculas, números e hífen.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
        </div>

        {mode === "edit" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) =>
                setValues((current) => ({
                  ...current,
                  status: value as BrandFormValues["status"],
                }))
              }
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue>
                  {(value: BrandFormValues["status"]) =>
                    value ? BRAND_STATUS_LABEL[value] : "Selecione"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONBOARDING">{BRAND_STATUS_LABEL.ONBOARDING}</SelectItem>
                <SelectItem value="ACTIVE">{BRAND_STATUS_LABEL.ACTIVE}</SelectItem>
                <SelectItem value="PAUSED">{BRAND_STATUS_LABEL.PAUSED}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="Prioridade"
        description="Define a ordem em que o scheduler analisa esta marca em relação às demais."
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priorityOrder">Prioridade no scheduler</Label>
          <Input
            id="priorityOrder"
            type="number"
            min={0}
            value={values.priorityOrder}
            onChange={(event) =>
              setValues((current) => ({ ...current, priorityOrder: Number(event.target.value) }))
            }
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">Menor número = analisada primeiro.</p>
        </div>
      </FormSection>

      <FormSection
        title="Palavras-chave"
        description="Controlam o que a JAMILE pode e não pode considerar desta marca (firewall entre marcas)."
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="topicKeywords">Palavras-chave permitidas</Label>
            <span className="text-xs text-muted-foreground">{topicKeywordsCount} termo(s)</span>
          </div>
          <Textarea
            id="topicKeywords"
            value={topicKeywordsText}
            onChange={(event) => setTopicKeywordsText(event.target.value)}
            rows={3}
            placeholder="ex: tênis de corrida, calçado esportivo"
          />
          <p className="text-xs text-muted-foreground">Separe os termos por vírgula.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="excludedKeywords">Termos excluídos</Label>
            <span className="text-xs text-muted-foreground">{excludedKeywordsCount} termo(s)</span>
          </div>
          <Textarea
            id="excludedKeywords"
            value={excludedKeywordsText}
            onChange={(event) => setExcludedKeywordsText(event.target.value)}
            rows={3}
            placeholder="ex: nome de outra marca do grupo"
          />
          <p className="text-xs text-muted-foreground">
            Termos de outras marcas do grupo — bloqueados para esta marca.
          </p>
        </div>
      </FormSection>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSaving} className="w-fit">
          {isSaving ? "Salvando..." : mode === "create" ? "Criar marca" : "Salvar alterações"}
        </Button>
        {mode === "create" ? (
          <Button type="button" variant="outline" onClick={() => router.back()} className="w-fit">
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
