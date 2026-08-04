"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Check, Copy, Pencil, Trash2, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { goalLabel } from "./brand-goal-options";
import type { BrandData } from "./brand-manager";

/** Confirmação inline de 2 cliques - mesmo padrão já usado em
 * NewConversationButton/attention-item.tsx, não um Dialog nativo. */
function ConfirmIconButton({
  icon: Icon,
  label,
  confirmLabel,
  onConfirm,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  tone?: "default" | "danger";
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">{confirmLabel}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          aria-label="Cancelar"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setConfirming(false);
            }
          }}
          aria-label="Confirmar"
          className={`flex size-6 items-center justify-center rounded-md ${tone === "danger" ? "text-destructive hover:bg-destructive/10" : "text-primary hover:bg-primary/10"}`}
        >
          <Check className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

export function BrandCard({ brand, onEdit, onChanged }: { brand: BrandData; onEdit: () => void; onChanged: () => void }) {
  async function handleDuplicate() {
    const response = await fetch(`/api/content/brands/${brand.id}/duplicate`, { method: "POST" });
    if (!response.ok) {
      toast.error("Falha ao duplicar marca.");
      return;
    }
    toast.success("Marca duplicada - revise e ative quando quiser.");
    onChanged();
  }

  async function handleArchive() {
    const response = await fetch(`/api/content/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (!response.ok) {
      toast.error("Falha ao arquivar marca.");
      return;
    }
    toast.success("Marca arquivada - ainda existe, só ficou inativa. Editar e salvar reativa de novo.");
    onChanged();
  }

  async function handleDelete() {
    const response = await fetch(`/api/content/brands/${brand.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Falha ao apagar marca.");
      return;
    }
    toast.success("Marca apagada.");
    onChanged();
  }

  const goal = goalLabel(brand.primaryGoal);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} className="size-10 rounded-full border object-contain" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
              {brand.name.slice(0, 2)}
            </div>
          )}
          <div>
            <p className="text-sm font-medium">{brand.name}</p>
            <p className="text-xs text-muted-foreground">ID: {brand.id.slice(0, 8)}...</p>
          </div>
        </div>
        <StatusBadge tone={brand.isActive ? "success" : "neutral"} label={brand.isActive ? "Ativa agora" : "Inativa"} />
      </div>

      {goal ? <span className="w-fit rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">{goal}</span> : null}

      {brand.valueProposition ? (
        <div>
          <p className="text-[11px] font-medium uppercase text-muted-foreground">Resumo</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{brand.valueProposition}</p>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">Cores</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {(["primary", "secondary", "accent"] as const).map((role) => (
            <span key={role} className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full border" style={{ backgroundColor: brand.palette[role] }} />
              {role === "primary" ? "Primária" : role === "secondary" ? "Secundária" : "Destaque"}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t pt-3">
        <button type="button" onClick={onEdit} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
          <Pencil className="size-3.5" />
          Editar
        </button>
        <ConfirmIconButton icon={Copy} label="Duplicar" confirmLabel="Duplicar marca?" onConfirm={handleDuplicate} />
        <ConfirmIconButton icon={Archive} label="Arquivar" confirmLabel="Arquivar?" onConfirm={handleArchive} />
        <div className="ml-auto">
          <ConfirmIconButton icon={Trash2} label="Apagar" confirmLabel="Apagar de vez?" onConfirm={handleDelete} tone="danger" />
        </div>
      </div>
    </div>
  );
}
