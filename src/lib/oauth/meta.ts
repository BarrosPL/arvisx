const GRAPH_API_VERSION = "v21.0";
const SCOPES = "ads_read,ads_management";

export interface DiscoveredAdAccount {
  externalAccountId: string;
  label: string;
}

export function isMetaOAuthConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function getMetaRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/oauth/meta/callback`;
}

export function buildMetaAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID nao configurado");

  const url = new URL(`https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", getMetaRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

interface MetaTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message: string };
}

export async function exchangeMetaCodeForShortLivedToken(code: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET nao configurados");

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", getMetaRedirectUri());
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  const body = (await response.json()) as MetaTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Meta OAuth error: ${body.error?.message ?? response.statusText}`);
  }
  return body.access_token;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds: number | null }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET nao configurados");

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url.toString());
  const body = (await response.json()) as MetaTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Meta OAuth error: ${body.error?.message ?? response.statusText}`);
  }
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? null };
}

interface MetaAdAccount {
  account_id?: string;
  name?: string;
  business_name?: string;
}

interface MetaAdAccountsResponse {
  data?: MetaAdAccount[];
  error?: { message: string };
}

export async function listMetaAdAccounts(accessToken: string): Promise<DiscoveredAdAccount[]> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/adaccounts`);
  url.searchParams.set("fields", "account_id,name,business_name");
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const body = (await response.json()) as MetaAdAccountsResponse;
  if (!response.ok || body.error) {
    throw new Error(`Meta API error: ${body.error?.message ?? response.statusText}`);
  }

  return (body.data ?? []).map((account) => ({
    externalAccountId: account.account_id ?? "",
    label: account.business_name ? `${account.name} (${account.business_name})` : (account.name ?? account.account_id ?? "Conta Meta"),
  }));
}

/** Checagem de saude no nivel do login (nao de uma conta especifica). */
export async function probeMetaConnection(accessToken: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/me`);
    url.searchParams.set("fields", "id");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url.toString());
    const body = (await response.json()) as { id?: string; error?: { message: string } };
    if (!response.ok || body.error) {
      return { ok: false, message: `Meta API error: ${body.error?.message ?? response.statusText}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
