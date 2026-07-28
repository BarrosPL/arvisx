"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND_STATUS_LABEL } from "@/lib/brands/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topicKeywords">Palavras-chave permitidas (firewall)</Label>
            <Textarea
              id="topicKeywords"
              value={topicKeywordsText}
              onChange={(event) => setTopicKeywordsText(event.target.value)}
              rows={3}
              placeholder="separadas por vírgula"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="excludedKeywords">Palavras-chave de outras marcas (bloqueadas)</Label>
            <Textarea
              id="excludedKeywords"
              value={excludedKeywordsText}
              onChange={(event) => setExcludedKeywordsText(event.target.value)}
              rows={3}
              placeholder="separadas por vírgula"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={isSaving} className="w-fit rounded-full">
            {isSaving ? "Salvando..." : mode === "create" ? "Criar marca" : "Salvar alterações"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
