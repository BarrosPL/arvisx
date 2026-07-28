"use client";

import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PublicAdLibraryItem {
  id: string;
  pageName: string | null;
  bodyText: string | null;
  deliveryStartDate: string | null;
  snapshotUrl: string | null;
}

export function PublicAdLibrarySearch({ brandId }: { brandId: string }) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [items, setItems] = useState<PublicAdLibraryItem[] | null>(null);

  async function handleSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/brands/${brandId}/library/search-public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao pesquisar a biblioteca pública.");
        setItems([]);
        return;
      }
      setItems(body.items ?? []);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Pesquisar concorrência (biblioteca pública da Meta)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Pesquisa anúncios de QUALQUER anunciante público (Brasil e outros países), pra usar como
          referência de mercado. Sem número de investimento nem alcance (só existe para anúncio
          político) — só o conteúdo real do criativo.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch();
            }}
            placeholder="Ex: cidadania italiana, visto de trabalho, mentoria de advogados..."
          />
          <Button onClick={handleSearch} disabled={isSearching || query.trim().length < 2} className="shrink-0 rounded-full">
            <Search className={isSearching ? "animate-pulse" : ""} />
            {isSearching ? "Buscando..." : "Buscar"}
          </Button>
        </div>

        {items === null ? null : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum anúncio público encontrado para essa busca.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
                <p className="truncate text-sm font-medium">{item.pageName ?? "Página desconhecida"}</p>
                {item.bodyText ? <p className="line-clamp-4 text-xs text-muted-foreground">{item.bodyText}</p> : null}
                <div className="flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                  <span>{item.deliveryStartDate ? `Desde ${item.deliveryStartDate}` : "—"}</span>
                  {item.snapshotUrl ? (
                    <a
                      href={item.snapshotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      Ver anúncio <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
