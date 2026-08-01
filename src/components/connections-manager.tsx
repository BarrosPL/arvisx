"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIconTile } from "@/components/brand-marks";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

type Platform = "META" | "GOOGLE";
type Status = "PENDING" | "CONNECTED" | "AUTH_ERROR" | "DISCONNECTED";

export interface ConnectionItem {
  id: string;
  platform: Platform;
  label: string | null;
  status: Status;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Contas de anuncio que entraram no sistema a partir deste login. */
  accountsCount: number;
}

interface DiscoveredAccount {
  externalAccountId: string;
  label: string;
  loginCustomerId: string | null;
  /** Preenchido quando a conta ja esta registrada no sistema. */
  credentialId: string | null;
  status: Status | null;
  /** Ja registrada por outro login - por isso nao aparece como desta conexao. */
  registeredViaOtherConnection: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Pendente",
  CONNECTED: "Conectada",
  AUTH_ERROR: "Erro de autenticação",
  DISCONNECTED: "Desconectada",
};

const STATUS_TONE: Record<Status, StatusTone> = {
  PENDING: "neutral",
  CONNECTED: "success",
  AUTH_ERROR: "danger",
  DISCONNECTED: "neutral",
};

const PLATFORM_LABEL: Record<Platform, string> = { META: "Meta Ads", GOOGLE: "Google Ads" };

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function PlatformStatusTile({
  platform,
  connected,
  configured,
  redirectUri,
}: {
  platform: Platform;
  connected: boolean;
  configured: boolean;
  redirectUri: string;
}) {
  const startPath = platform === "META" ? "meta" : "google";

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <PlatformIconTile platform={platform} size="lg" />
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{PLATFORM_LABEL[platform]}</span>
          <StatusBadge tone={connected ? "success" : "neutral"} label={connected ? "Conectado" : "Pendente"} />
        </div>
        {connected ? (
          <span className="text-xs text-muted-foreground">Login conectado</span>
        ) : configured ? (
          <span className="text-xs text-muted-foreground">Nenhum login conectado ainda</span>
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            Não configurado — redirect URI: <code className="rounded bg-muted px-1">{redirectUri}</code>
          </span>
        )}
      </div>
      {!connected ? (
        <Button
          size="sm"
          render={<a href={`/api/oauth/${startPath}/start`} />}
          nativeButton={false}
          disabled={!configured}
          className="shrink-0 rounded-full"
        >
          Conectar
        </Button>
      ) : null}
    </div>
  );
}

/** Linha SÓ DE LEITURA de uma conta descoberta. Não há mais escolha a fazer aqui: toda
 * conta visível no login entra no sistema automaticamente (ver
 * lib/accounts/autoProvision.ts) - esta lista só mostra o que entrou. */
function AccountRow({ account }: { account: DiscoveredAccount }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{account.label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {account.externalAccountId}
          {account.registeredViaOtherConnection ? " · já registrada por outro login" : ""}
        </span>
      </div>
      <StatusBadge
        tone={account.credentialId ? STATUS_TONE[account.status ?? "CONNECTED"] : "neutral"}
        label={account.credentialId ? STATUS_LABEL[account.status ?? "CONNECTED"] : "Não registrada"}
        className="shrink-0"
      />
    </div>
  );
}

function ConnectionCard({ connection, onRefresh }: { connection: ConnectionItem; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [accounts, setAccounts] = useState<DiscoveredAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [search, setSearch] = useState("");

  const filteredAccounts = useMemo(() => {
    if (!accounts) return null;
    const query = normalizeText(search.trim());
    if (!query) return accounts;
    return accounts.filter(
      (account) => normalizeText(account.label).includes(query) || account.externalAccountId.includes(query)
    );
  }, [accounts, search]);

  async function loadAccounts() {
    setIsLoadingAccounts(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/connections/${connection.id}/accounts`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(body.error ?? "Falha ao listar contas.");
        return;
      }
      setAccounts(body.accounts ?? []);
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  async function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && accounts === null) {
      await loadAccounts();
    }
  }

  async function handleHealthCheck() {
    setIsBusy(true);
    try {
      await fetch(`/api/connections/${connection.id}/health-check`, { method: "POST" });
      onRefresh();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisconnect() {
    setIsBusy(true);
    try {
      await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-4 p-4">
        <PlatformIconTile platform={connection.platform} />
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{connection.label ?? PLATFORM_LABEL[connection.platform]}</span>
            <StatusBadge tone={STATUS_TONE[connection.status]} label={STATUS_LABEL[connection.status]} />
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {connection.accountsCount} conta(s) de anúncio · última checagem:{" "}
            {connection.lastCheckedAt ? formatDateTime(new Date(connection.lastCheckedAt)) : "nunca"}
          </span>
          {connection.lastError ? (
            <span className="flex items-center gap-1 truncate text-xs text-destructive">
              <AlertCircle className="size-3 shrink-0" />
              {connection.lastError}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isBusy}
            onClick={handleHealthCheck}
            title="Testar conexão"
            aria-label="Testar conexão"
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isBusy}
            onClick={handleDisconnect}
            title="Desconectar"
            aria-label="Desconectar"
          >
            <Trash2 />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggle}>
            {expanded ? <ChevronUp /> : <ChevronDown />}
            Contas
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-4 border-t p-4">
          {isLoadingAccounts ? (
            <p className="text-sm text-muted-foreground">Carregando contas...</p>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : accounts && accounts.length > 0 ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome ou ID da conta..."
                  className="pl-8"
                />
              </div>
              {filteredAccounts && filteredAccounts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {filteredAccounts.map((account) => (
                    <AccountRow key={account.externalAccountId} account={account} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma conta encontrada para essa busca.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma conta encontrada para este login.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ConnectionsManager({
  initialConnections,
  metaConfigured,
  googleConfigured,
  metaRedirectUri,
  googleRedirectUri,
  oauthError,
}: {
  initialConnections: ConnectionItem[];
  metaConfigured: boolean;
  googleConfigured: boolean;
  metaRedirectUri: string;
  googleRedirectUri: string;
  oauthError?: string;
}) {
  const router = useRouter();

  const metaConnected = initialConnections.some((c) => c.platform === "META" && c.status === "CONNECTED");
  const googleConnected = initialConnections.some((c) => c.platform === "GOOGLE" && c.status === "CONNECTED");

  return (
    <div className="flex flex-col gap-6">
      {oauthError ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {oauthError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlatformStatusTile
          platform="META"
          connected={metaConnected}
          configured={metaConfigured}
          redirectUri={metaRedirectUri}
        />
        <PlatformStatusTile
          platform="GOOGLE"
          connected={googleConnected}
          configured={googleConfigured}
          redirectUri={googleRedirectUri}
        />
      </div>

      <div className="flex flex-col gap-3">
        {initialConnections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum login conectado ainda.</p>
        ) : (
          initialConnections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} onRefresh={() => router.refresh()} />
          ))
        )}
      </div>
    </div>
  );
}
