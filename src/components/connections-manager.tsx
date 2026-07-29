"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIconTile } from "@/components/brand-marks";
import { BrandAvatar } from "@/components/brand-avatar";
import { BrandCombobox, type BrandComboboxOption } from "@/components/brand-combobox";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

type Platform = "META" | "GOOGLE";
type Status = "PENDING" | "CONNECTED" | "AUTH_ERROR" | "DISCONNECTED";

export interface ConnectionItem {
  id: string;
  platform: Platform;
  label: string | null;
  status: Status;
  lastCheckedAt: string | null;
  lastError: string | null;
  assignmentsCount: number;
}

export type BrandOption = BrandComboboxOption;

interface DiscoveredAccount {
  externalAccountId: string;
  label: string;
  loginCustomerId: string | null;
  assignedBrand: { id: string; name: string } | null;
  assignedViaOtherConnection: boolean;
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
            Não configurado — redirect URI:{" "}
            <code className="rounded bg-muted px-1">{redirectUri}</code>
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

function AccountRow({
  connectionId,
  account,
  brands,
  onAssignmentChange,
}: {
  connectionId: string;
  account: DiscoveredAccount;
  brands: BrandOption[];
  onAssignmentChange: (externalAccountId: string, assignedBrand: { id: string; name: string } | null) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function handleChange(brandId: string | null) {
    setIsSaving(true);
    try {
      const response = !brandId
        ? await fetch(`/api/connections/${connectionId}/assign`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ externalAccountId: account.externalAccountId }),
          })
        : await fetch(`/api/connections/${connectionId}/assign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              externalAccountId: account.externalAccountId,
              brandId,
              label: account.label,
              loginCustomerId: account.loginCustomerId ?? undefined,
            }),
          });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(body.error ?? "Falha ao atualizar a atribuição.");
        return;
      }

      const brand = brandId ? (brands.find((b) => b.id === brandId) ?? null) : null;
      onAssignmentChange(account.externalAccountId, brand);

      if (brandId) {
        const summary = body.collectSummary as { rowCount: number; state: string } | null | undefined;
        toast.success(
          summary
            ? `Conta atribuída a ${brand?.name ?? "marca"} — ${summary.rowCount} anúncio(s) sincronizado(s).`
            : `Conta atribuída a ${brand?.name ?? "marca"} — sincronização inicial falhou, mas vai tentar de novo sozinha em breve.`
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{account.label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {account.externalAccountId}
          {account.assignedViaOtherConnection ? " · atribuída via outra conexão" : ""}
        </span>
      </div>
      <BrandCombobox
        brands={brands}
        value={account.assignedBrand?.id ?? null}
        onSelect={handleChange}
        disabled={isSaving}
      />
    </div>
  );
}

function ConnectionCard({
  connection,
  brands,
  onRefresh,
}: {
  connection: ConnectionItem;
  brands: BrandOption[];
  onRefresh: () => void;
}) {
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
      (account) =>
        normalizeText(account.label).includes(query) || account.externalAccountId.includes(query)
    );
  }, [accounts, search]);

  const unassignedAccounts = useMemo(
    () => filteredAccounts?.filter((account) => !account.assignedBrand) ?? [],
    [filteredAccounts]
  );

  const assignedGroups = useMemo(() => {
    const groups = new Map<string, { brand: { id: string; name: string }; accounts: DiscoveredAccount[] }>();
    for (const account of filteredAccounts ?? []) {
      if (!account.assignedBrand) continue;
      const key = account.assignedBrand.id;
      if (!groups.has(key)) {
        groups.set(key, { brand: account.assignedBrand, accounts: [] });
      }
      groups.get(key)!.accounts.push(account);
    }
    return Array.from(groups.values());
  }, [filteredAccounts]);

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

  /**
   * Atualiza so a linha da conta afetada com o resultado ja conhecido da chamada de
   * assign/unassign, em vez de recarregar a lista inteira - recarregar mostrava
   * "Carregando contas..." e fazia a lista toda desaparecer/reaparecer a cada atribuicao.
   */
  function handleAssignmentChange(externalAccountId: string, assignedBrand: { id: string; name: string } | null) {
    setAccounts((prev) =>
      prev
        ? prev.map((account) =>
            account.externalAccountId === externalAccountId
              ? { ...account, assignedBrand, assignedViaOtherConnection: false }
              : account
          )
        : prev
    );
    onRefresh();
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
            <span className="truncate font-medium">
              {connection.label ?? PLATFORM_LABEL[connection.platform]}
            </span>
            <StatusBadge tone={STATUS_TONE[connection.status]} label={STATUS_LABEL[connection.status]} />
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {connection.assignmentsCount} conta(s) atribuída(s) · última checagem:{" "}
            {connection.lastCheckedAt ? new Date(connection.lastCheckedAt).toLocaleString("pt-BR") : "nunca"}
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

              {unassignedAccounts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Não foi possível criar marca automaticamente ({unassignedAccounts.length}) — escolha manualmente
                  </span>
                  {unassignedAccounts.map((account) => (
                    <AccountRow
                      key={account.externalAccountId}
                      connectionId={connection.id}
                      account={account}
                      brands={brands}
                      onAssignmentChange={handleAssignmentChange}
                    />
                  ))}
                </div>
              ) : null}

              {assignedGroups.map(({ brand, accounts: brandAccounts }) => (
                <div key={brand.id} className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <BrandAvatar name={brand.name} seed={brand.id} size="xs" />
                    Atribuídas a {brand.name} ({brandAccounts.length})
                  </span>
                  {brandAccounts.map((account) => (
                    <AccountRow
                      key={account.externalAccountId}
                      connectionId={connection.id}
                      account={account}
                      brands={brands}
                      onAssignmentChange={handleAssignmentChange}
                    />
                  ))}
                </div>
              ))}

              {unassignedAccounts.length === 0 && assignedGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conta encontrada para essa busca.</p>
              ) : null}
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
  brands,
  metaConfigured,
  googleConfigured,
  metaRedirectUri,
  googleRedirectUri,
  oauthError,
}: {
  initialConnections: ConnectionItem[];
  brands: BrandOption[];
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
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {oauthError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlatformStatusTile platform="META" connected={metaConnected} configured={metaConfigured} redirectUri={metaRedirectUri} />
        <PlatformStatusTile platform="GOOGLE" connected={googleConnected} configured={googleConfigured} redirectUri={googleRedirectUri} />
      </div>

      <div className="flex flex-col gap-3">
        {initialConnections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum login conectado ainda.</p>
        ) : (
          initialConnections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              brands={brands}
              onRefresh={() => router.refresh()}
            />
          ))
        )}
      </div>
    </div>
  );
}
