# SSO Setup (PR-B)

Tenant-aware Single Sign-On for **Microsoft (Azure AD), Google, GitHub, Apple**.

## How it works

- **Credentials live in the server env** (one OAuth app per provider, shared across
  tenants). A provider only appears on the login page once its env vars are set.
- **Per-tenant enable + routing lives in the DB.** Each tenant admin (Settings →
  *Single Sign-On*) toggles which providers are allowed for their organization and
  sets the **email domains** that route to it (e.g. `objektus.de`).
- **Flow:** user clicks a provider on `/login` → OAuth round-trip →
  on callback we read the verified email, find the tenant whose `ssoDomains`
  contains the email's domain, verify the provider is enabled there, then either
  link to an existing account, auto-provision a new `User` (if enabled), or reject.
- Login issues the **same cookie session** as password login. Password login is
  unchanged and always available (SSO is additive).

## Callback (redirect) URLs to register

For each provider, register this redirect URI (prod shown; for local dev swap the host):

```
https://tasks.coastshield.net/api/auth/azure-ad/callback
https://tasks.coastshield.net/api/auth/google/callback
https://tasks.coastshield.net/api/auth/github/callback
https://tasks.coastshield.net/api/auth/apple/callback
```

## Env vars (set in `.env.task-tracker` on the VPS)

```bash
# Microsoft / Azure AD
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
AZURE_AD_TENANT_ID=common        # or your directory (tenant) id for single-tenant

# Google  (Google Cloud Console → Credentials → OAuth client, type "Web")
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# GitHub  (Settings → Developer settings → OAuth Apps)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Apple   (Apple Developer → Identifiers → Services ID + Sign in with Apple key)
APPLE_CLIENT_ID=...               # the Services ID
APPLE_CLIENT_SECRET=...           # the pre-generated client-secret JWT (ES256, max 6 months)
```

After setting env vars, recreate the container (`docker compose ... up -d --force-recreate task-tracker`).
The provider buttons then appear on `/login` automatically.

## Per-provider registration notes

- **Azure AD:** App registration → Authentication → add the redirect URI (Web).
  API permissions: `openid`, `profile`, `email`, `User.Read` (Graph). Create a
  client secret. Use `common` for multi-tenant or your tenant id for single-tenant.
- **Google:** OAuth consent screen + Web OAuth client. Scopes `openid email profile`.
- **GitHub:** OAuth App. Scopes `read:user user:email` (the app requests these).
- **Apple:** create an **App ID** with Sign in with Apple, a **Services ID**
  (= `APPLE_CLIENT_ID`), and a **Sign in with Apple key**; generate the client
  secret JWT (ES256, `iss`=team id, `sub`=services id, `aud`=`https://appleid.apple.com`)
  and put it in `APPLE_CLIENT_SECRET`. Apple posts the callback (`response_mode=form_post`),
  which the callback route already handles.

## Tenant admin steps (in the app)

1. Log in as the tenant admin → **Settings → Single Sign-On**.
2. Enter the org's **email domains** (comma-separated).
3. Enable the desired providers; optionally toggle **auto-create account on first login**.
4. Save. Users at those domains can now use those providers.

## Testing status

- ✅ Unit-tested: provider registry, env-gating, authorize-URL building, email→tenant routing.
- ✅ E2E-tested: login hides SSO buttons when unconfigured, password login intact,
  admin sees the SSO settings card, normal users don't.
- ⏳ **Live OAuth round-trip is not automatically tested** — it requires the real
  provider app registrations + env credentials above. Once set, verify each
  provider end-to-end in a browser.
