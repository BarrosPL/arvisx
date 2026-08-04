"use client";

import { useEffect } from "react";
import { getConsentPreferences } from "./consent-banner";

function sendEvent(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/public/events", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/public/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }
}

/**
 * Unico responsavel por page_view/block_click na pagina publica - so dispara depois do
 * visitante aceitar "analytics" no banner (nenhum pixel/tracking antes do aceite,
 * F7.4, aplicado tambem ao tracking proprio da ARVISX, nao so pixel de terceiro).
 * Delegacao de clique num listener so (em vez de handler por link) - blocks.tsx
 * continua 100% server component, so ganha `data-block-id` nos elementos clicaveis.
 */
export function PageViewTracker({ bioPageId }: { bioPageId: string }) {
  useEffect(() => {
    const consent = getConsentPreferences();
    if (!consent?.analytics) return;

    sendEvent({ bioPageId, event: "PAGE_VIEW" });

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const blockEl = target.closest<HTMLElement>("[data-block-id]");
      if (!blockEl) return;
      sendEvent({ bioPageId, blockId: blockEl.dataset.blockId, event: "BLOCK_CLICK" });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [bioPageId]);

  return null;
}
