"use client";

import { useState } from "react";
import { Bell, Inbox } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AttentionItem } from "@/components/attention-item";
import { EmptyState } from "@/components/empty-state";
import type { AttentionEntry } from "@/lib/notifications";

/**
 * Sino de notificação - substitui as antigas seções "Atenção necessária" e
 * "Propostas aguardando decisão" do dashboard. Fica no header (visível em qualquer
 * página, não só no dashboard). Clicar num item abre o chat da JAMILE com o
 * contexto certo (mesmo comportamento que AttentionItem já tinha) - a diferença é
 * só de onde a lista aparece agora.
 */
export function NotificationBell({ items }: { items: AttentionEntry[] }) {
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={count > 0 ? `${count} notificação(ões) pendente(s)` : "Notificações"}
        className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted"
      >
        <Bell className="size-4.5" />
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-2">
        {items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nada precisa da sua atenção agora"
            description="Novas sugestões da JAMILE aparecem aqui."
            className="border-0 bg-transparent px-2 py-6"
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <AttentionItem
                key={item.key}
                tone={item.tone}
                title={item.title}
                description={item.description}
                prefill={item.prefill}
                proposalId={item.proposalId}
                needsCreativeAsset={item.needsCreativeAsset}
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
