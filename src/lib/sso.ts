// OAuth 2.0 / OIDC SSO — focused, dependency-free (uses global fetch).
// Client credentials come from ENV (one app per provider, shared across tenants);
// per-tenant enable/routing lives in the DB. Pure helpers here are unit-tested.

export const SSO_PROVIDERS = ["azure-ad", "google", "github", "apple"] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];

export function isSsoProvider(v: string): v is SsoProvider {
  return (SSO_PROVIDERS as readonly string[]).includes(v);
}

export const PROVIDER_LABELS: Record<SsoProvider, string> = {
  "azure-ad": "Microsoft",
  google: "Google",
  github: "GitHub",
  apple: "Apple",
};

type ProviderMeta = {
  authorizeUrl: () => string;
  tokenUrl: () => string;
  scope: string;
  responseMode?: "query" | "form_post";
  clientIdEnv: string;
  clientSecretEnv: string;
};

const azureTenant = () => process.env.AZURE_AD_TENANT_ID || "common";

export const PROVIDER_META: Record<SsoProvider, ProviderMeta> = {
  "azure-ad": {
    authorizeUrl: () =>
      `https://login.microsoftonline.com/${azureTenant()}/oauth2/v2.0/authorize`,
    tokenUrl: () =>
      `https://login.microsoftonline.com/${azureTenant()}/oauth2/v2.0/token`,
    scope: "openid profile email User.Read",
    clientIdEnv: "AZURE_AD_CLIENT_ID",
    clientSecretEnv: "AZURE_AD_CLIENT_SECRET",
  },
  google: {
    authorizeUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authorizeUrl: () => "https://github.com/login/oauth/authorize",
    tokenUrl: () => "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  apple: {
    authorizeUrl: () => "https://appleid.apple.com/auth/authorize",
    tokenUrl: () => "https://appleid.apple.com/auth/token",
    scope: "name email",
    responseMode: "form_post",
    clientIdEnv: "APPLE_CLIENT_ID",
    clientSecretEnv: "APPLE_CLIENT_SECRET", // pre-generated client-secret JWT
  },
};

/** A provider is usable only when its app credentials are present in the env. */
export function isProviderConfigured(provider: SsoProvider): boolean {
  const m = PROVIDER_META[provider];
  return Boolean(process.env[m.clientIdEnv] && process.env[m.clientSecretEnv]);
}

export function configuredProviders(): SsoProvider[] {
  return SSO_PROVIDERS.filter(isProviderConfigured);
}

export function buildAuthorizeUrl(
  provider: SsoProvider,
  opts: { redirectUri: string; state: string }
): string {
  const m = PROVIDER_META[provider];
  const clientId = process.env[m.clientIdEnv] ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: m.scope,
    state: opts.state,
  });
  if (m.responseMode) params.set("response_mode", m.responseMode);
  if (provider === "azure-ad") params.set("prompt", "select_account");
  return `${m.authorizeUrl()}?${params.toString()}`;
}

type Tokens = { access_token?: string; id_token?: string };

export async function exchangeCode(
  provider: SsoProvider,
  code: string,
  redirectUri: string
): Promise<Tokens> {
  const m = PROVIDER_META[provider];
  const body = new URLSearchParams({
    client_id: process.env[m.clientIdEnv] ?? "",
    client_secret: process.env[m.clientSecretEnv] ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(m.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return (await res.json()) as Tokens;
}

export type SsoUser = { sub: string; email: string; name: string };

function decodeJwt(jwt: string): any {
  const part = jwt.split(".")[1];
  if (!part) return {};
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/** Resolve a normalized {sub,email,name} from a provider's tokens. */
export async function fetchUserInfo(
  provider: SsoProvider,
  tokens: Tokens
): Promise<SsoUser> {
  if (provider === "apple") {
    const p = decodeJwt(tokens.id_token ?? "");
    return { sub: String(p.sub ?? ""), email: String(p.email ?? ""), name: String(p.email ?? "") };
  }
  if (provider === "google") {
    const p = decodeJwt(tokens.id_token ?? "");
    if (p.sub) return { sub: String(p.sub), email: String(p.email ?? ""), name: String(p.name ?? p.email ?? "") };
  }
  const auth = { Authorization: `Bearer ${tokens.access_token}` };
  if (provider === "azure-ad") {
    const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: auth });
    const u = await r.json();
    const email = u.mail || u.userPrincipalName || "";
    return { sub: String(u.id ?? ""), email: String(email), name: String(u.displayName ?? email) };
  }
  if (provider === "github") {
    const r = await fetch("https://api.github.com/user", {
      headers: { ...auth, Accept: "application/vnd.github+json" },
    });
    const u = await r.json();
    let email: string = u.email ?? "";
    if (!email) {
      const er = await fetch("https://api.github.com/user/emails", {
        headers: { ...auth, Accept: "application/vnd.github+json" },
      });
      const emails = (await er.json()) as Array<{ email: string; primary: boolean }>;
      email = emails?.find((e) => e.primary)?.email ?? emails?.[0]?.email ?? "";
    }
    return { sub: String(u.id ?? ""), email: String(email), name: String(u.name || u.login || email) };
  }
  // google fallback via userinfo endpoint
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth });
  const u = await r.json();
  return { sub: String(u.sub ?? ""), email: String(u.email ?? ""), name: String(u.name ?? u.email ?? "") };
}

/** Match an email's domain against a tenant's comma-separated ssoDomains. */
export function emailMatchesDomains(
  email: string,
  ssoDomains: string | null | undefined
): boolean {
  if (!email || !ssoDomains) return false;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return ssoDomains
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .includes(domain);
}
