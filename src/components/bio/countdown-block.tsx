"use client";

import { useEffect, useState } from "react";

interface Props {
  targetAt: string;
  label: string;
  onExpire: "hide" | "keep" | "message";
}

function remaining(targetAt: string) {
  return Math.max(0, new Date(targetAt).getTime() - Date.now());
}

/**
 * Unico bloco que genuinamente precisa de JS pra funcionar (tick a cada segundo) - os
 * outros 11 tipos sao 100% server component. `msLeft` comeca null de proposito: o
 * servidor e o cliente calculariam `Date.now()` em instantes ligeiramente diferentes,
 * o que divergiria o numero renderizado e disparariam aviso de hydration mismatch -
 * so calcula de verdade depois de montar (microtask evita setState sincrono no corpo
 * do efeito, mesmo padrao ja usado no resto do modulo de conteudo).
 */
export function CountdownBlock({ targetAt, label, onExpire }: Props) {
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setMsLeft(remaining(targetAt)));
    const interval = setInterval(() => setMsLeft(remaining(targetAt)), 1000);
    return () => clearInterval(interval);
  }, [targetAt]);

  if (msLeft === null) return null;
  if (msLeft <= 0 && onExpire === "hide") return null;

  const totalSeconds = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-black/10 bg-white/90 p-4 text-black">
      <p className="text-xs font-medium text-black/70">{label}</p>
      {msLeft <= 0 && onExpire === "message" ? (
        <p className="text-sm">Encerrado</p>
      ) : (
        <div className="flex gap-3 text-center tabular-nums">
          {[
            { value: days, unit: "d" },
            { value: hours, unit: "h" },
            { value: minutes, unit: "m" },
            { value: seconds, unit: "s" },
          ].map(({ value, unit }) => (
            <div key={unit} className="flex flex-col">
              <span className="text-xl font-semibold">{String(value).padStart(2, "0")}</span>
              <span className="text-[10px] text-black/50">{unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
