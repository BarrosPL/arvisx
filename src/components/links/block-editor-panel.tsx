"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadFormField } from "@/lib/content/schema";

export type SimpleBlockType =
  | "LINK"
  | "WHATSAPP"
  | "TEXT"
  | "IMAGE"
  | "SOCIAL_ICONS"
  | "DIVIDER"
  | "LEAD_FORM"
  | "VIDEO"
  | "FAQ"
  | "COUNTDOWN"
  | "PRODUCT_CARD"
  | "CALENDAR_EMBED";

export const BLOCK_TYPE_LABEL: Record<SimpleBlockType, string> = {
  LINK: "Link",
  WHATSAPP: "WhatsApp",
  TEXT: "Texto",
  IMAGE: "Imagem",
  SOCIAL_ICONS: "Redes sociais",
  DIVIDER: "Divisor",
  LEAD_FORM: "Formulário de contato",
  VIDEO: "Vídeo",
  FAQ: "Perguntas frequentes",
  COUNTDOWN: "Contagem regressiva",
  PRODUCT_CARD: "Produto",
  CALENDAR_EMBED: "Agenda",
};

const SIMPLE_BLOCK_TYPES: SimpleBlockType[] = [
  "LINK",
  "WHATSAPP",
  "TEXT",
  "IMAGE",
  "SOCIAL_ICONS",
  "DIVIDER",
  "LEAD_FORM",
  "VIDEO",
  "FAQ",
  "COUNTDOWN",
  "PRODUCT_CARD",
  "CALENDAR_EMBED",
];

/** Campos fixos do v1 - um construtor de campos dinamico (chave/tipo/obrigatorio/
 * finalidade por linha) fica pra fatia 9. Todos "contact" - so quando existir um field
 * "marketing" de verdade e que o segundo checkbox de consentimento aparece na pagina
 * publica (a logica ja suporta isso, so a UI de criacao ainda nao oferece escolher). */
const DEFAULT_LEAD_FORM_FIELDS: LeadFormField[] = [
  { key: "nome", label: "Nome", type: "text", required: true, purpose: "contact" },
  { key: "email", label: "Email", type: "email", required: true, purpose: "contact" },
  { key: "telefone", label: "Telefone", type: "phone", required: false, purpose: "contact" },
];

interface LeadFormDraft {
  name: string;
  consentText: string;
  privacyPolicyUrl: string;
  successMessage: string;
  webhookUrl: string;
}

const DEFAULT_LEAD_FORM_DRAFT: LeadFormDraft = {
  name: "Contato",
  consentText: "Concordo em ser contatado e com o tratamento dos meus dados.",
  privacyPolicyUrl: "",
  successMessage: "Recebemos seus dados, obrigado!",
  webhookUrl: "",
};

export interface BlockFormValue {
  id: string;
  type: SimpleBlockType;
  config: Record<string, unknown>;
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

function defaultConfigFor(type: SimpleBlockType): Record<string, unknown> {
  switch (type) {
    case "LINK":
      return { label: "", url: "" };
    case "WHATSAPP":
      return { phone: "", prefilledMessage: "" };
    case "TEXT":
      return { markdown: "" };
    case "IMAGE":
      return { assetId: "", alt: "" };
    case "SOCIAL_ICONS":
      return { networks: [] };
    case "DIVIDER":
      return { style: "line" };
    case "LEAD_FORM":
      return { leadFormId: "", mode: "inline", buttonLabel: "Enviar" };
    case "VIDEO":
      return { provider: "youtube", url: "", autoplay: false };
    case "FAQ":
      return { items: [] };
    case "COUNTDOWN":
      return { targetAt: "", label: "", onExpire: "keep" };
    case "PRODUCT_CARD":
      return { title: "", price: "", image: "", ctaUrl: "" };
    case "CALENDAR_EMBED":
      return { provider: "calendly", url: "" };
  }
}

export function BlockEditorPanel({
  bioPageId,
  existing,
  onCancel,
  onSaved,
}: {
  bioPageId: string;
  existing?: BlockFormValue;
  onCancel: () => void;
  onSaved: (block: unknown, wasNew: boolean) => void;
}) {
  const [type, setType] = useState<SimpleBlockType>(existing?.type ?? "LINK");
  const [config, setConfig] = useState<Record<string, unknown>>(existing?.config ?? defaultConfigFor(type));
  const [leadFormDraft, setLeadFormDraft] = useState<LeadFormDraft>(DEFAULT_LEAD_FORM_DRAFT);
  // Snapshot da URL do webhook NO MOMENTO EM QUE CARREGOU - so serve pra diff no save
  // (decidir se precisa gerar segredo novo), nunca editado diretamente pela UI.
  const [initialWebhookUrl, setInitialWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (type !== "LEAD_FORM" || !existing?.config.leadFormId) return;
    let cancelled = false;
    fetch(`/api/content/lead-forms/${existing.config.leadFormId}`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body.leadForm) return;
        setLeadFormDraft({
          name: body.leadForm.name,
          consentText: body.leadForm.consentText,
          privacyPolicyUrl: body.leadForm.privacyPolicyUrl,
          successMessage: body.leadForm.successAction?.message ?? "",
          webhookUrl: body.leadForm.webhookUrl ?? "",
        });
        setInitialWebhookUrl(body.leadForm.webhookUrl ?? "");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateConfig(patch: Record<string, unknown>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateLeadFormDraft(patch: Partial<LeadFormDraft>) {
    setLeadFormDraft((current) => ({ ...current, ...patch }));
  }

  function handleTypeChange(nextType: SimpleBlockType) {
    setType(nextType);
    setConfig(defaultConfigFor(nextType));
    if (nextType === "LEAD_FORM") setLeadFormDraft(DEFAULT_LEAD_FORM_DRAFT);
  }

  async function handleImageUpload(file: File) {
    setIsUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch("/api/content/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, mimeType: file.type }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao enviar imagem.");
        return;
      }
      updateConfig({ assetId: body.asset.id });
    } finally {
      setIsUploading(false);
    }
  }

  function showWebhookSecret(secret: string) {
    toast.success(`Segredo do webhook (copie agora - não será mostrado de novo): ${secret}`, { duration: 30_000 });
  }

  async function saveLeadFormBlock(wasNew: boolean) {
    const successAction = { type: "message" as const, message: leadFormDraft.successMessage.trim() || undefined };
    let leadFormId = String(config.leadFormId ?? "");

    const webhookUrl = leadFormDraft.webhookUrl.trim();

    if (!leadFormId) {
      const response = await fetch(`/api/content/bio-pages/${bioPageId}/lead-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadFormDraft.name.trim(),
          fields: DEFAULT_LEAD_FORM_FIELDS,
          consentText: leadFormDraft.consentText.trim(),
          consentRequired: true,
          privacyPolicyUrl: leadFormDraft.privacyPolicyUrl.trim(),
          successAction,
          webhookUrl: webhookUrl || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao criar formulário.");
        return null;
      }
      leadFormId = body.leadForm.id;
      if (body.webhookSecret) showWebhookSecret(body.webhookSecret);
    } else {
      // So manda webhookUrl se mudou de verdade (comparado ao snapshot do carregamento,
      // NAO ao proprio valor atual - senao a comparacao seria sempre igual a si mesma).
      // "" (usuario apagou) precisa virar null explicito pra rota remover de verdade.
      const webhookUrlPatch = webhookUrl === initialWebhookUrl ? undefined : webhookUrl || null;

      const response = await fetch(`/api/content/lead-forms/${leadFormId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadFormDraft.name.trim(),
          consentText: leadFormDraft.consentText.trim(),
          privacyPolicyUrl: leadFormDraft.privacyPolicyUrl.trim(),
          successAction,
          webhookUrl: webhookUrlPatch,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao atualizar formulário.");
        return null;
      }
      if (body.webhookSecret) showWebhookSecret(body.webhookSecret);
    }

    const blockConfig = { ...config, leadFormId };
    const url = wasNew
      ? `/api/content/bio-pages/${bioPageId}/blocks`
      : `/api/content/bio-pages/${bioPageId}/blocks/${existing!.id}`;
    const payload = wasNew ? { type, config: blockConfig } : { content: { type, config: blockConfig } };
    const response = await fetch(url, {
      method: wasNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? "Falha ao salvar bloco.");
      return null;
    }
    return body.block;
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const wasNew = !existing;

      if (type === "LEAD_FORM") {
        const block = await saveLeadFormBlock(wasNew);
        if (!block) return;
        toast.success("Bloco salvo.");
        onSaved(block, wasNew);
        return;
      }

      const url = wasNew
        ? `/api/content/bio-pages/${bioPageId}/blocks`
        : `/api/content/bio-pages/${bioPageId}/blocks/${existing.id}`;
      const payload = wasNew ? { type, config } : { content: { type, config } };

      const response = await fetch(url, {
        method: wasNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao salvar bloco.");
        return;
      }
      toast.success("Bloco salvo.");
      onSaved(body.block, wasNew);
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = (() => {
    switch (type) {
      case "LINK":
        return !!config.label && !!config.url;
      case "WHATSAPP":
        return !!config.phone;
      case "TEXT":
        return !!config.markdown;
      case "IMAGE":
        return !!config.assetId && !!config.alt;
      case "SOCIAL_ICONS":
        return Array.isArray(config.networks) && config.networks.length > 0;
      case "DIVIDER":
        return true;
      case "LEAD_FORM":
        return !!leadFormDraft.name && !!leadFormDraft.consentText && !!leadFormDraft.privacyPolicyUrl && !!config.buttonLabel;
      case "VIDEO":
        return !!config.url;
      case "FAQ":
        return Array.isArray(config.items) && config.items.length > 0;
      case "COUNTDOWN":
        return !!config.targetAt && !!config.label;
      case "PRODUCT_CARD":
        return !!config.title && !!config.price && !!config.image && !!config.ctaUrl;
      case "CALENDAR_EMBED":
        return !!config.url;
    }
  })();

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <Select value={type} onValueChange={(value) => handleTypeChange(value as SimpleBlockType)} disabled={!!existing}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIMPLE_BLOCK_TYPES.map((option) => (
              <SelectItem key={option} value={option}>
                {BLOCK_TYPE_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {type === "LINK" ? (
        <>
          <Field label="Texto do botão">
            <Input value={String(config.label ?? "")} onChange={(event) => updateConfig({ label: event.target.value })} />
          </Field>
          <Field label="URL">
            <Input
              value={String(config.url ?? "")}
              onChange={(event) => updateConfig({ url: event.target.value })}
              placeholder="https://"
            />
          </Field>
        </>
      ) : null}

      {type === "WHATSAPP" ? (
        <>
          <Field label="Telefone (com DDI)">
            <Input
              value={String(config.phone ?? "")}
              onChange={(event) => updateConfig({ phone: event.target.value })}
              placeholder="5511999999999"
            />
          </Field>
          <Field label="Mensagem pré-preenchida (opcional)">
            <Textarea
              value={String(config.prefilledMessage ?? "")}
              onChange={(event) => updateConfig({ prefilledMessage: event.target.value })}
              rows={2}
            />
          </Field>
        </>
      ) : null}

      {type === "TEXT" ? (
        <Field label="Texto">
          <Textarea value={String(config.markdown ?? "")} onChange={(event) => updateConfig({ markdown: event.target.value })} rows={3} />
        </Field>
      ) : null}

      {type === "IMAGE" ? (
        <>
          <Field label="Imagem">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
          </Field>
          {config.assetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/public/media/${config.assetId}`}
              alt="Prévia"
              className="h-24 w-24 rounded-md border object-cover"
            />
          ) : null}
          <Field label="Texto alternativo">
            <Input value={String(config.alt ?? "")} onChange={(event) => updateConfig({ alt: event.target.value })} />
          </Field>
        </>
      ) : null}

      {type === "SOCIAL_ICONS" ? <SocialIconsFields config={config} updateConfig={updateConfig} /> : null}

      {type === "DIVIDER" ? (
        <Field label="Estilo">
          <Select value={String(config.style ?? "line")} onValueChange={(value) => updateConfig({ style: value })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line">Linha</SelectItem>
              <SelectItem value="space">Espaço</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {type === "LEAD_FORM" ? (
        <>
          <Field label="Texto do botão">
            <Input value={String(config.buttonLabel ?? "")} onChange={(event) => updateConfig({ buttonLabel: event.target.value })} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Campos do v1: Nome, Email, Telefone (fixos) - personalizar campos é uma melhoria futura.
          </p>
          <Field label="Nome do formulário (interno)">
            <Input value={leadFormDraft.name} onChange={(event) => updateLeadFormDraft({ name: event.target.value })} />
          </Field>
          <Field label="Texto de consentimento">
            <Textarea
              value={leadFormDraft.consentText}
              onChange={(event) => updateLeadFormDraft({ consentText: event.target.value })}
              rows={2}
            />
          </Field>
          <Field label="Link da política de privacidade">
            <Input
              value={leadFormDraft.privacyPolicyUrl}
              onChange={(event) => updateLeadFormDraft({ privacyPolicyUrl: event.target.value })}
              placeholder="https://"
            />
          </Field>
          <Field label="Mensagem de sucesso">
            <Input
              value={leadFormDraft.successMessage}
              onChange={(event) => updateLeadFormDraft({ successMessage: event.target.value })}
            />
          </Field>
          <Field label="Webhook (opcional) - notifica esta URL a cada lead novo">
            <Input
              value={leadFormDraft.webhookUrl}
              onChange={(event) => updateLeadFormDraft({ webhookUrl: event.target.value })}
              placeholder="https://"
            />
          </Field>
          {initialWebhookUrl ? (
            <p className="text-xs text-muted-foreground">
              Trocar a URL gera um segredo novo (o anterior deixa de funcionar). Deixar em branco remove o webhook.
            </p>
          ) : null}
        </>
      ) : null}

      {type === "VIDEO" ? (
        <>
          <Field label="Provedor">
            <Select value={String(config.provider ?? "youtube")} onValueChange={(value) => updateConfig({ provider: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="vimeo">Vimeo</SelectItem>
                <SelectItem value="direct">Arquivo direto (mp4)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="URL">
            <Input value={String(config.url ?? "")} onChange={(event) => updateConfig({ url: event.target.value })} placeholder="https://" />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!config.autoplay}
              onChange={(event) => updateConfig({ autoplay: event.target.checked })}
            />
            Reproduzir automaticamente (sem som)
          </label>
        </>
      ) : null}

      {type === "FAQ" ? <FaqFields config={config} updateConfig={updateConfig} /> : null}

      {type === "COUNTDOWN" ? (
        <>
          <Field label="Rótulo">
            <Input value={String(config.label ?? "")} onChange={(event) => updateConfig({ label: event.target.value })} />
          </Field>
          <Field label="Data/hora alvo">
            <Input
              type="datetime-local"
              value={String(config.targetAt ?? "").slice(0, 16)}
              onChange={(event) => updateConfig({ targetAt: new Date(event.target.value).toISOString() })}
            />
          </Field>
          <Field label="Ao expirar">
            <Select value={String(config.onExpire ?? "keep")} onValueChange={(value) => updateConfig({ onExpire: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Manter mostrando zerado</SelectItem>
                <SelectItem value="hide">Esconder o bloco</SelectItem>
                <SelectItem value="message">Mostrar mensagem</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      ) : null}

      {type === "PRODUCT_CARD" ? (
        <>
          <Field label="Título">
            <Input value={String(config.title ?? "")} onChange={(event) => updateConfig({ title: event.target.value })} />
          </Field>
          <Field label="Preço">
            <Input value={String(config.price ?? "")} onChange={(event) => updateConfig({ price: event.target.value })} placeholder="R$ 99" />
          </Field>
          <Field label="Imagem">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                fileToBase64(file).then(async (dataBase64) => {
                  const response = await fetch("/api/content/assets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dataBase64, mimeType: file.type }),
                  });
                  const body = await response.json().catch(() => ({}));
                  // PRODUCT_CARD.image exige URL absoluta (z.string().url() no schema,
                  // diferente do bloco IMAGE que so guarda o id e monta o path na hora
                  // de renderizar) - publicUrl ja vem pronta de storePublicImage.
                  if (response.ok) updateConfig({ image: body.asset.publicUrl });
                });
              }}
            />
          </Field>
          <Field label="Link de compra/detalhes">
            <Input value={String(config.ctaUrl ?? "")} onChange={(event) => updateConfig({ ctaUrl: event.target.value })} placeholder="https://" />
          </Field>
        </>
      ) : null}

      {type === "CALENDAR_EMBED" ? (
        <>
          <Field label="Provedor">
            <Select value={String(config.provider ?? "calendly")} onValueChange={(value) => updateConfig({ provider: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendly">Calendly</SelectItem>
                <SelectItem value="cal.com">Cal.com</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="URL de agendamento">
            <Input value={String(config.url ?? "")} onChange={(event) => updateConfig({ url: event.target.value })} placeholder="https://" />
          </Field>
        </>
      ) : null}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!canSave || isSaving} size="sm">
          {isSaving ? "Salvando..." : "Salvar bloco"}
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm">
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SocialIconsFields({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
}) {
  const networks = (config.networks as { network: string; url: string }[] | undefined) ?? [];

  function setNetworks(next: { network: string; url: string }[]) {
    updateConfig({ networks: next });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Redes</Label>
      {networks.map((entry, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={entry.network}
            onChange={(event) => {
              const next = [...networks];
              next[index] = { ...entry, network: event.target.value };
              setNetworks(next);
            }}
            placeholder="instagram"
            className="w-32"
          />
          <Input
            value={entry.url}
            onChange={(event) => {
              const next = [...networks];
              next[index] = { ...entry, url: event.target.value };
              setNetworks(next);
            }}
            placeholder="https://"
          />
          <button
            type="button"
            onClick={() => setNetworks(networks.filter((_, i) => i !== index))}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setNetworks([...networks, { network: "", url: "" }])}
      >
        <Plus className="size-3.5" /> Adicionar rede
      </Button>
    </div>
  );
}

function FaqFields({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
}) {
  const items = (config.items as { q: string; a: string }[] | undefined) ?? [];

  function setItems(next: { q: string; a: string }[]) {
    updateConfig({ items: next });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Perguntas</Label>
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-1 rounded-md border p-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={item.q}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, q: event.target.value };
                setItems(next);
              }}
              placeholder="Pergunta"
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, i) => i !== index))}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <Textarea
            value={item.a}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, a: event.target.value };
              setItems(next);
            }}
            placeholder="Resposta"
            rows={2}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => setItems([...items, { q: "", a: "" }])}>
        <Plus className="size-3.5" /> Adicionar pergunta
      </Button>
    </div>
  );
}
