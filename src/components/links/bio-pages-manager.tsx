"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, X, Check, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface BioPageSummary {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  createdAt: string;
}

export function BioPagesManager() {
  const [bioPages, setBioPages] = useState<BioPageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadBioPages() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/content/bio-pages");
      const body = await response.json().catch(() => ({}));
      setBioPages(body.bioPages ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/content/bio-pages")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setBioPages(body.bioPages ?? []);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <CreateBioPageForm onCreated={loadBioPages} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando páginas...</p>
      ) : bioPages.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma página criada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bioPages.map((bioPage) => (
            <BioPageCard key={bioPage.id} bioPage={bioPage} onDeleted={loadBioPages} />
          ))}
        </div>
      )}
    </div>
  );
}

function BioPageCard({ bioPage, onDeleted }: { bioPage: BioPageSummary; onDeleted: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/content/bio-pages/${bioPage.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao excluir página.");
        return;
      }
      toast.success("Página excluída.");
      onDeleted();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <Link href={`/links/${bioPage.id}`} className="truncate hover:underline">
            {bioPage.title}
          </Link>
          <Badge variant={bioPage.isPublished ? "default" : "outline"} className="text-[10px]">
            {bioPage.isPublished ? "Publicada" : "Rascunho"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <a
          href={`/p/${bioPage.slug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          /p/{bioPage.slug} <ExternalLink className="size-3" />
        </a>
        {confirmingDelete ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setConfirmingDelete(false)}
              className="flex size-6 flex-1 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="flex size-6 flex-1 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
            >
              <Check className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center justify-center gap-1 self-start text-[11px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" /> Excluir
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function CreateBioPageForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/content/bio-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), slug }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao criar página.");
        return;
      }
      toast.success("Página criada.");
      setTitle("");
      setSlug("");
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova página</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Minha marca" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Endereço (/p/...)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              placeholder="minha-marca"
            />
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="self-start">
          {isSubmitting ? "Criando..." : "Criar página"}
        </Button>
      </CardContent>
    </Card>
  );
}
