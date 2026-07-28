import { safeFetchJson } from "@/lib/http/safeFetchJson";

const GOOGLE_ADS_API_VERSION = "v25";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/adwords";

export interface DiscoveredAdAccount {
  externalAccountId: string;
  label: string;
  /** Id da MCC (conta gerenciadora) necessario no header login-customer-id pra acessar
   * esta conta - null quando a conta e acessada diretamente, sem MCC no meio. */
  loginCustomerId: string | null;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  );
}

export function getGoogleRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/oauth/google/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_ADS_CLIENT_ID nao configurado");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeGoogleCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET nao configurados");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(),
      code,
      grant_type: "authorization_code",
    }),
  });

  const body = await safeFetchJson<GoogleTokenResponse>(response);
  if (!response.ok || body.error || !body.access_token) {
    throw new Error(`Google OAuth error: ${body.error ?? response.statusText} - ${body.error_description ?? ""}`);
  }

  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null };
}

interface ListAccessibleCustomersResponse {
  resourceNames?: string[];
  error?: { message?: string };
}

async function fetchCustomerDescriptiveName(accessToken: string, customerId: string): Promise<string | null> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) return null;

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT customer.descriptive_name FROM customer LIMIT 1" }),
      }
    );
    if (!response.ok) return null;
    const body = await safeFetchJson<{ results?: { customer?: { descriptiveName?: string } }[] }[]>(response);
    const batches = Array.isArray(body) ? body : [body];
    for (const batch of batches) {
      const name = batch.results?.[0]?.customer?.descriptiveName;
      if (name) return name;
    }
    return null;
  } catch {
    return null;
  }
}

interface CustomerClientRow {
  customerClient?: {
    id?: string;
    level?: number;
    manager?: boolean;
    descriptiveName?: string;
  };
}

/**
 * Pra cada id diretamente acessivel pelo login (retornado por listAccessibleCustomers),
 * pergunta pelo Google Ads a arvore de contas ate 1 nivel abaixo (customer_client) -
 * cobre o caso comum de uma MCC com contas-cliente direto embaixo. Se esse id for uma
 * MCC (manager=true), as contas de anuncio de verdade sao os filhos (level=1), e pra
 * acessar cada uma delas em qualquer chamada futura e obrigatorio mandar o header
 * login-customer-id com o id da MCC - por isso essa funcao ja devolve isso pronto.
 * Se a query falhar (ex: id sem acesso a customer_client por algum motivo), cai no
 * fallback de tratar o proprio id como conta avulsa, igual o comportamento anterior.
 */
async function fetchCustomerClientTree(accessToken: string, topCustomerId: string): Promise<CustomerClientRow[]> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) return [];

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${topCustomerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": topCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT
              customer_client.id,
              customer_client.level,
              customer_client.manager,
              customer_client.descriptive_name
            FROM customer_client
            WHERE customer_client.level <= 1
          `,
        }),
      }
    );
    if (!response.ok) return [];
    const body = await safeFetchJson<{ results?: CustomerClientRow[] }[]>(response);
    const batches = Array.isArray(body) ? body : [body];
    const rows: CustomerClientRow[] = [];
    for (const batch of batches) rows.push(...(batch.results ?? []));
    return rows;
  } catch {
    return [];
  }
}

export async function listGoogleAccessibleCustomers(accessToken: string): Promise<DiscoveredAdAccount[]> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN nao configurado");

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
      },
    }
  );

  const body = await safeFetchJson<ListAccessibleCustomersResponse>(response);
  if (!response.ok || body.error) {
    throw new Error(`Google Ads API error: ${body.error?.message ?? response.statusText}`);
  }

  const topLevelIds = (body.resourceNames ?? []).map((name) => name.replace("customers/", ""));

  const accounts: DiscoveredAdAccount[] = [];
  const seen = new Set<string>();

  for (const topId of topLevelIds) {
    const rows = await fetchCustomerClientTree(accessToken, topId);

    if (rows.length === 0) {
      // Nao deu pra ler a arvore (ex: erro de permissao pontual) - trata como conta
      // avulsa, igual o comportamento antes desta hierarquia existir.
      if (!seen.has(topId)) {
        seen.add(topId);
        const name = await fetchCustomerDescriptiveName(accessToken, topId);
        accounts.push({ externalAccountId: topId, label: name ?? topId, loginCustomerId: null });
      }
      continue;
    }

    for (const row of rows) {
      const id = row.customerClient?.id;
      if (!id || seen.has(id) || row.customerClient?.manager) continue; // pula MCCs - nao sao contas de anuncio
      seen.add(id);
      accounts.push({
        externalAccountId: id,
        label: row.customerClient?.descriptiveName || id,
        loginCustomerId: id === topId ? null : topId,
      });
    }
  }

  return accounts;
}

/** Checagem de saude no nivel do login: tenta trocar o refresh token por um access token novo. */
export async function probeGoogleConnection(refreshToken: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, message: "GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET nao configurados" };
    }
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const body = await safeFetchJson<GoogleTokenResponse>(response);
    if (!response.ok || body.error || !body.access_token) {
      return {
        ok: false,
        message: `Google OAuth error: ${body.error ?? response.statusText} - ${body.error_description ?? ""}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
