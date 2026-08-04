"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, X, Check, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS = ["FRIO", "MORNO", "QUENTE", "REMARKETING", "LOOKALIKE"] as const;
type Stage = (typeof STAGE_OPTIONS)[number];
/** So estas 3 entram na grade de cobertura por gancho - a spec (secao 3) fala
 * especificamente de variacao Fria/Morna/Quente por gancho; Remarketing/1% (LOOKALIKE)
 * sao mecanismos de escala, nao variacao de gancho/persona. */
const COVERAGE_STAGES: Stage[] = ["FRIO", "MORNO", "QUENTE"];
const STAGE_LABEL: Record<Stage, string> = {
  FRIO: "Frio",
  MORNO: "Morno",
  QUENTE: "Quente",
  REMARKETING: "Remarketing",
  LOOKALIKE: "1%/Lookalike",
};

interface CreativeAsset {
  id: string;
  credentialId: string;
  productName: string;
  hook: string;
  funnelStage: Stage | null;
  label: string;
  notes: string | null;
  kind: "IMAGE" | "VIDEO";
  createdAt: string;
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

export function CreativeLibraryManager({ credentials }: { credentials: { id: string; name: string }[] }) {
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadAssets() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/creative-library");
      const body = await response.json().catch(() => ({}));
      setAssets(body.assets ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/creative-library")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setAssets(body.assets ?? []);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const byProduct = new Map<string, Map<string, CreativeAsset[]>>();
    for (const asset of assets) {
      if (!byProduct.has(asset.productName)) byProduct.set(asset.productName, new Map());
      const byHook = byProduct.get(asset.productName)!;
      if (!byHook.has(asset.hook)) byHook.set(asset.hook, []);
      byHook.get(asset.hook)!.push(asset);
    }
    return byProduct;
  }, [assets]);

  if (credentials.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Conecte uma conta de anúncios antes de catalogar criativos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <CreativeUploadForm credentials={credentials} onCreated={loadAssets} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando catálogo...</p>
      ) : grouped.size === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum criativo catalogado ainda.
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([productName, byHook]) => (
          <div key={productName} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{productName}</h2>
            <div className="flex flex-col gap-3">
              {Array.from(byHook.entries()).map(([hook, hookAssets]) => (
                <HookGroup key={hook} hook={hook} assets={hookAssets} onDeleted={loadAssets} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function HookGroup({ hook, assets, onDeleted }: { hook: string; assets: CreativeAsset[]; onDeleted: () => void }) {
  const coveredStages = new Set(assets.map((asset) => asset.funnelStage).filter(Boolean));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{hook}</span>
          <div className="flex items-center gap-1.5">
            {COVERAGE_STAGES.map((stage) => (
              <Badge key={stage} variant={coveredStages.has(stage) ? "default" : "outline"} className="text-[10px]">
                {STAGE_LABEL[stage]}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} onDeleted={onDeleted} />
        ))}
      </CardContent>
    </Card>
  );
}

function AssetCard({ asset, onDeleted }: { asset: CreativeAsset; onDeleted: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/creative-library/${asset.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao excluir criativo.");
        return;
      }
      toast.success("Criativo removido do catálogo.");
      onDeleted();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex w-40 flex-col gap-1.5 rounded-lg border bg-background p-2">
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/creative-library/${asset.id}/preview`}
          alt={asset.label}
          className="h-full w-full object-cover"
        />
        <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground">
          {asset.kind === "VIDEO" ? <VideoIcon className="size-3" /> : <ImageIcon className="size-3" />}
        </span>
      </div>
      <p className="truncate text-xs font-medium" title={asset.label}>
        {asset.label}
      </p>
      {asset.funnelStage ? (
        <Badge variant="secondary" className="w-fit text-[10px]">
          {STAGE_LABEL[asset.funnelStage]}
        </Badge>
      ) : null}
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
    </div>
  );
}

function CreativeUploadForm({
  credentials,
  onCreated,
}: {
  credentials: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [credentialId, setCredentialId] = useState(credentials[0]?.id ?? "");
  const [productName, setProductName] = useState("");
  const [hook, setHook] = useState("");
  const [funnelStage, setFunnelStage] = useState<Stage | "NONE">("NONE");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<"image" | "video">("image");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    credentialId &&
    productName.trim() &&
    hook.trim() &&
    label.trim() &&
    (format === "image" ? !!imageFile : !!videoFile && !!coverFile);

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const base = {
        credentialId,
        productName: productName.trim(),
        hook: hook.trim(),
        funnelStage: funnelStage === "NONE" ? undefined : funnelStage,
        label: label.trim(),
        notes: notes.trim() || undefined,
      };
      const payload =
        format === "image"
          ? { ...base, dataBase64: await fileToBase64(imageFile!), mimeType: imageFile!.type }
          : {
              ...base,
              videoBase64: await fileToBase64(videoFile!),
              videoMimeType: videoFile!.type,
              coverImageBase64: await fileToBase64(coverFile!),
              coverImageMimeType: coverFile!.type,
            };

      const response = await fetch("/api/creative-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao catalogar criativo.");
        return;
      }
      toast.success("Criativo catalogado.");
      setProductName("");
      setHook("");
      setFunnelStage("NONE");
      setLabel("");
      setNotes("");
      setImageFile(null);
      setVideoFile(null);
      setCoverFile(null);
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalogar criativo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="credential">Conta</Label>
            <Select value={credentialId} onValueChange={(value) => setCredentialId(value ?? "")}>
              <SelectTrigger id="credential" className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {credentials.map((credential) => (
                  <SelectItem key={credential.id} value={credential.id}>
                    {credential.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stage">Estágio (opcional)</Label>
            <Select value={funnelStage} onValueChange={(value) => setFunnelStage(value as Stage | "NONE")}>
              <SelectTrigger id="stage" className="w-full">
                <SelectValue placeholder="Sem estágio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Sem estágio</SelectItem>
                {STAGE_OPTIONS.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABEL[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="productName">Produto</Label>
            <Input
              id="productName"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Ex: Nacionalidade Portuguesa"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hook">Gancho/persona</Label>
            <Input
              id="hook"
              value={hook}
              onChange={(event) => setHook(event.target.value)}
              placeholder="Ex: neto, bisneto, casamento"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="label">Título do criativo</Label>
            <Input
              id="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex: Depoimento neto v2"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFormat("image")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              format === "image" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
            )}
          >
            Imagem
          </button>
          <button
            type="button"
            onClick={() => setFormat("video")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              format === "video" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
            )}
          >
            Vídeo
          </button>
        </div>

        {format === "image" ? (
          <Input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Vídeo</Label>
              <Input
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Capa</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        )}

        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="self-start">
          {isSubmitting ? "Catalogando..." : "Catalogar"}
        </Button>
      </CardContent>
    </Card>
  );
}
