"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Pencil, X, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BlockEditorPanel, type SimpleBlockType, type BlockFormValue, BLOCK_TYPE_LABEL } from "./block-editor-panel";
import type { BioBlock } from "@/generated/prisma/client";

function blockSummary(block: BioBlock): string {
  const config = block.config as Record<string, unknown>;
  switch (block.type) {
    case "LINK":
      return String(config.label ?? "");
    case "WHATSAPP":
      return String(config.phone ?? "");
    case "TEXT":
      return String(config.markdown ?? "").slice(0, 60);
    case "IMAGE":
      return String(config.alt ?? "");
    case "SOCIAL_ICONS":
      return `${(config.networks as unknown[] | undefined)?.length ?? 0} rede(s)`;
    case "LEAD_FORM":
      return String(config.buttonLabel ?? "");
    case "DIVIDER":
      return "Divisor";
    case "VIDEO":
      return String(config.url ?? "");
    case "FAQ":
      return `${(config.items as unknown[] | undefined)?.length ?? 0} pergunta(s)`;
    case "COUNTDOWN":
      return String(config.label ?? "");
    case "PRODUCT_CARD":
      return String(config.title ?? "");
    case "CALENDAR_EMBED":
      return String(config.url ?? "");
    default:
      return block.type;
  }
}

function SortableBlockRow({
  block,
  onEdit,
  onDeleted,
}: {
  block: BioBlock;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/content/bio-pages/${block.bioPageId}/blocks/${block.id}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao excluir bloco.");
        return;
      }
      onDeleted();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2",
        isDragging && "opacity-50"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {BLOCK_TYPE_LABEL[block.type as SimpleBlockType] ?? block.type}
      </Badge>
      <span className={cn("min-w-0 flex-1 truncate text-sm", !block.isActive && "text-muted-foreground line-through")}>
        {blockSummary(block)}
      </span>
      {confirmingDelete ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => setConfirmingDelete(false)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDelete}
            className="flex size-6 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
          >
            <Check className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function BlockManager({ bioPageId, initialBlocks }: { bioPageId: string; initialBlocks: BioBlock[] }) {
  const [blocks, setBlocks] = useState<BioBlock[]>(initialBlocks);
  const [editingBlockId, setEditingBlockId] = useState<string | "new" | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((block) => block.id === active.id);
    const newIndex = blocks.findIndex((block) => block.id === over.id);
    const reordered = arrayMove(blocks, oldIndex, newIndex);
    setBlocks(reordered);

    const response = await fetch(`/api/content/bio-pages/${bioPageId}/blocks/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((block) => block.id) }),
    });
    if (!response.ok) {
      toast.error("Falha ao reordenar - desfazendo.");
      setBlocks(blocks);
    }
  }

  function refreshAfterSave(saved: BioBlock, wasNew: boolean) {
    setBlocks((current) => (wasNew ? [...current, saved] : current.map((block) => (block.id === saved.id ? saved : block))));
    setEditingBlockId(null);
  }

  function refreshAfterDelete() {
    setBlocks((current) => current.filter((block) => editingBlockId !== block.id));
    fetch(`/api/content/bio-pages/${bioPageId}`)
      .then((response) => response.json())
      .then((body) => setBlocks(body.blocks ?? []));
  }

  const editingBlock = editingBlockId && editingBlockId !== "new" ? blocks.find((block) => block.id === editingBlockId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum bloco ainda.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {blocks.map((block) => (
                  <SortableBlockRow
                    key={block.id}
                    block={block}
                    onEdit={() => setEditingBlockId(block.id)}
                    onDeleted={refreshAfterDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {editingBlockId === "new" || editingBlock ? (
          <BlockEditorPanel
            bioPageId={bioPageId}
            existing={editingBlock as unknown as BlockFormValue | undefined}
            onCancel={() => setEditingBlockId(null)}
            onSaved={(saved, wasNew) => refreshAfterSave(saved as unknown as BioBlock, wasNew)}
          />
        ) : (
          <Button variant="outline" onClick={() => setEditingBlockId("new")} className="self-start">
            Adicionar bloco
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
