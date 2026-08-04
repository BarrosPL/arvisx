"use client";

import { useEffect, useState } from "react";

const COOKIE_NAME = "arvisx_consent";
const COOKIE_MAX_AGE_DAYS = 365;

export interface ConsentPreferences {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

/** Lido pelo tracking first-party (fatia 8) e por qualquer pixel de terceiro futuro
 * (v1.1) antes de disparar - "nenhum pixel dispara antes do aceite" (F7.4) vale
 * inclusive pro proprio tracking da ARVISX, nao so pixel de terceiro. */
export function getConsentPreferences(): ConsentPreferences | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function setConsentCookie(preferences: ConsentPreferences) {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(preferences))}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // So le o cookie depois de montar (nunca no servidor) - microtask evita disparar
    // setState sincrono direto no corpo do efeito.
    Promise.resolve().then(() => setVisible(!getConsentPreferences()));
  }, []);

  function accept(preferences: Omit<ConsentPreferences, "necessary">) {
    setConsentCookie({ necessary: true, ...preferences });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-black/10 bg-white p-4 text-black shadow-lg">
      <p className="text-xs text-black/70">
        Usamos cookies para lembrar suas preferências e entender como esta página é usada.
      </p>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked disabled />
            Necessários (sempre ativos)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
            Analytics (visitas e cliques)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
            Marketing (pixels de anúncio)
          </label>
          <button
            type="button"
            onClick={() => accept({ analytics, marketing })}
            className="mt-1 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
          >
            Salvar preferências
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => accept({ analytics: true, marketing: true })}
            className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"
          >
            Aceitar tudo
          </button>
          <button
            type="button"
            onClick={() => accept({ analytics: false, marketing: false })}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium"
          >
            Somente necessários
          </button>
          <button type="button" onClick={() => setExpanded(true)} className="text-xs underline">
            Personalizar
          </button>
        </div>
      )}
    </div>
  );
}
