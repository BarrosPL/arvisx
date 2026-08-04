"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BioBlock, BioPage } from "@/generated/prisma/client";
import { BlockManager } from "./block-manager";
import { LeadsPanel } from "./leads-panel";
import { AnalyticsPanel } from "./analytics-panel";

export function BioPageEditor({ bioPage, initialBlocks }: { bioPage: BioPage; initialBlocks: BioBlock[] }) {
  const [title, setTitle] = useState(bioPage.title);
  const [slug, setSlug] = useState(bioPage.slug);
  const [headline, setHeadline] = useState(bioPage.headline ?? "");
  const [bio, setBio] = useState(bioPage.bio ?? "");
  const [isPublished, setIsPublished] = useState(bioPage.isPublished);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(nextPublished?: boolean) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/content/bio-pages/${bioPage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug,
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          isPublished: nextPublished ?? isPublished,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao salvar.");
        return;
      }
      if (nextPublished !== undefined) setIsPublished(nextPublished);
      toast.success("Salvo.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Detalhes</span>
            <a
              href={`/p/${bioPage.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Ver página <ExternalLink className="size-3" />
            </a>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Título</Label>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Endereço (/p/...)</Label>
              <Input id="slug" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="headline">Frase de destaque</Label>
              <Input id="headline" value={headline} onChange={(event) => setHeadline(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} rows={3} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => handleSave()} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
            <Button
              variant={isPublished ? "outline" : "default"}
              onClick={() => handleSave(!isPublished)}
              disabled={isSaving}
            >
              {isPublished ? "Despublicar" : "Publicar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <BlockManager bioPageId={bioPage.id} initialBlocks={initialBlocks} />
      <AnalyticsPanel bioPageId={bioPage.id} />
      <LeadsPanel bioPageId={bioPage.id} />
    </div>
  );
}
