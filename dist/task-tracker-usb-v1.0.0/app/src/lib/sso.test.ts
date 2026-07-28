import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SSO_PROVIDERS,
  isSsoProvider,
  isProviderConfigured,
  configuredProviders,
  buildAuthorizeUrl,
  emailMatchesDomains,
  PROVIDER_META,
} from "./sso";

describe("isSsoProvider", () => {
  it("accepts known providers, rejects others", () => {
    expect(isSsoProvider("google")).toBe(true);
    expect(isSsoProvider("azure-ad")).toBe(true);
    expect(isSsoProvider("facebook")).toBe(false);
    expect(isSsoProvider("")).toBe(false);
  });
});

describe("emailMatchesDomains", () => {
  it("matches case-insensitively against a comma list", () => {
    expect(emailMatchesDomains("a@objektus.de", "objektus.de")).toBe(true);
    expect(emailMatchesDomains("A@Objektus.DE", "objektus.de, coastshield.net")).toBe(true);
    expect(emailMatchesDomains("a@coastshield.net", "objektus.de, coastshield.net")).toBe(true);
  });
  it("rejects non-members and bad input", () => {
    expect(emailMatchesDomains("a@gmail.com", "objektus.de")).toBe(false);
    expect(emailMatchesDomains("a@objektus.de", null)).toBe(false);
    expect(emailMatchesDomains("not-an-email", "objektus.de")).toBe(false);
    expect(emailMatchesDomains("", "objektus.de")).toBe(false);
  });
});

describe("provider configuration via env", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const p of SSO_PROVIDERS) {
      delete process.env[PROVIDER_META[p].clientIdEnv];
      delete process.env[PROVIDER_META[p].clientSecretEnv];
    }
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is unconfigured when env vars are absent", () => {
    expect(isProviderConfigured("google")).toBe(false);
    expect(configuredProviders()).toEqual([]);
  });

  it("becomes configured once both id and secret are present", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(isProviderConfigured("google")).toBe(true);
    expect(configuredProviders()).toContain("google");
  });

  it("needs BOTH id and secret", () => {
    process.env.GITHUB_CLIENT_ID = "id-only";
    expect(isProviderConfigured("github")).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("builds a Google authorize URL with required params", () => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    const url = new URL(
      buildAuthorizeUrl("google", {
        redirectUri: "https://x.test/api/auth/google/callback",
        state: "abc123",
      })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("gid");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://x.test/api/auth/google/callback"
    );
    expect(url.searchParams.get("scope")).toContain("email");
  });

  it("uses the configured Azure tenant and adds form_post for Apple", () => {
    process.env.AZURE_AD_TENANT_ID = "my-tenant";
    const azure = buildAuthorizeUrl("azure-ad", { redirectUri: "https://x/cb", state: "s" });
    expect(azure).toContain("login.microsoftonline.com/my-tenant/");

    const apple = new URL(
      buildAuthorizeUrl("apple", { redirectUri: "https://x/cb", state: "s" })
    );
    expect(apple.searchParams.get("response_mode")).toBe("form_post");
  });
});
