"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { cn } from "@/lib/utils";
import type { LeadFormField } from "@/lib/content/schema";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Props {
  leadFormId: string;
  buttonLabel: string;
  fields: LeadFormField[];
  consentText: string;
  consentRequired: boolean;
  privacyPolicyUrl: string;
}

/**
 * Unico client island desta fatia - o resto da pagina publica e server component puro.
 * Cada finalidade (purpose) distinta presente em `fields` vira UM checkbox (RGPD:
 * finalidades separadas) - hoje todo formulario padrao so tem finalidade "contact",
 * entao na pratica aparece um checkbox so; o texto (`consentText`) e compartilhado
 * entre finalidades por simplicidade do v1 (LeadForm ainda nao guarda um texto por
 * finalidade).
 */
export function LeadFormBlock({ leadFormId, buttonLabel, fields, consentText, consentRequired, privacyPolicyUrl }: Props) {
  const purposes = Array.from(new Set(fields.map((field) => field.purpose)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: true; message?: string } | { ok: false; error: string } | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const container = turnstileContainerRef.current;
    if (!container) return;

    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (window.turnstile) {
        window.turnstile.render(container, { sitekey: TURNSTILE_SITE_KEY, callback: setTurnstileToken });
      } else {
        setTimeout(tryRender, 200);
      }
    };
    tryRender();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        const value = params.get(key);
        if (value) utm[key] = value;
      }

      const response = await fetch(`/api/public/forms/${leadFormId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: values,
          consent,
          utm,
          referrer: document.referrer || undefined,
          honeypot,
          turnstileToken,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({ ok: false, error: body.error ?? "Falha ao enviar. Tente novamente." });
        return;
      }
      if (body.successAction?.type === "redirect" && body.successAction.redirectUrl) {
        window.location.href = body.successAction.redirectUrl;
        return;
      }
      setResult({ ok: true, message: body.successAction?.message || "Recebemos seus dados, obrigado!" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result?.ok) {
    return <p className="rounded-xl border border-black/10 bg-white/90 px-4 py-3 text-center text-sm">{result.message}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2 rounded-xl border border-black/10 bg-white/90 p-4">
      {/* Honeypot: offscreen via CSS (nao display:none) - bot que preenche tudo cega
          preenche isto tambem; humano nunca ve nem chega a tabular ate aqui. */}
      <input
        type="text"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] size-px opacity-0"
      />
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <label htmlFor={field.key} className="text-xs font-medium text-black/70">
            {field.label}
            {field.required ? " *" : ""}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={field.key}
              required={field.required}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              rows={3}
              className="rounded-lg border border-black/15 px-2.5 py-1.5 text-sm text-black"
            />
          ) : (
            <input
              id={field.key}
              type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
              required={field.required}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              className="rounded-lg border border-black/15 px-2.5 py-1.5 text-sm text-black"
            />
          )}
        </div>
      ))}

      {purposes.map((purpose) => (
        <label key={purpose} className="flex items-start gap-2 text-xs text-black/70">
          <input
            type="checkbox"
            required={consentRequired}
            checked={!!consent[purpose]}
            onChange={(event) => setConsent((current) => ({ ...current, [purpose]: event.target.checked }))}
            className="mt-0.5"
          />
          <span>
            {consentText}{" "}
            <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className="underline">
              Política de privacidade
            </a>
          </span>
        </label>
      ))}

      {TURNSTILE_SITE_KEY ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
          <div ref={turnstileContainerRef} />
        </>
      ) : null}

      {result && !result.ok ? <p className="text-xs text-red-600">{result.error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
        className={cn(
          "mt-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity",
          isSubmitting && "opacity-60"
        )}
      >
        {isSubmitting ? "Enviando..." : buttonLabel}
      </button>
    </form>
  );
}
