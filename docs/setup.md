# Initial setup

## 1. Enable the editor site

Repository Settings → Pages → Source: **GitHub Actions**. Run **Publish editor shell** from Actions if the first deployment failed before enabling Pages.

Expected URL: https://rohitmoni.github.io/renpy-live/

## 2. Deploy the authentication Worker

In Cloudflare, open **Workers & Pages**, create a Worker named **renpy-live-auth**, deploy its default code, then use **Edit code** to replace it with the complete contents of `auth-worker/src/index.mjs`. Deploy again. Menu labels may vary.

Copy the resulting `https://renpy-live-auth.<your-subdomain>.workers.dev` URL. Visiting `/health` should show `ok: true` and `configured: false` until settings are supplied.

Alternatively, locally: clone the repo, enter `auth-worker`, run `npx wrangler login`, then `npx wrangler deploy`. Wrangler uses `wrangler.jsonc`.

## 3. Register the GitHub App

Open https://github.com/settings/apps/new

| Field | Value |
| --- | --- |
| GitHub App name | Renpy Live by RohitMoni (or another available name) |
| Homepage URL | https://rohitmoni.github.io/renpy-live/ |
| Callback URL | Your Worker URL followed by `/auth/callback` |
| Expire user authorization tokens | Enabled |
| Request user authorization during installation | Disabled initially; sign in separately from the dashboard |
| Device flow | Disabled |
| Setup URL | Your Worker URL followed by `/` |
| Webhook Active | Disabled |
| Repository Contents | Read and write |
| Repository Metadata | Read-only (automatic) |
| Other permissions | No access initially |
| Where can this app be installed? | Any account |

Create the app. Copy its **Client ID** and app slug (the name in `github.com/apps/<slug>`). Generate a **client secret**. This starter acts on behalf of users, so it does not need a private key.

## 4. Configure Cloudflare

Worker Settings → Variables and Secrets. Add:

| Name | Type | Value |
| --- | --- | --- |
| GITHUB_CLIENT_ID | Text | GitHub App Client ID, not App ID |
| GITHUB_APP_SLUG | Text | App slug |
| EDITOR_URL | Text | https://rohitmoni.github.io/renpy-live/ |
| GITHUB_CLIENT_SECRET | Secret | Generated GitHub client secret |
| SESSION_SECRET | Secret | Random secret with at least 32 characters |

Generate SESSION_SECRET locally with `openssl rand -hex 32`, or a password manager. Keep secrets out of source files, GitHub commits, screenshots and chat. Apply/deploy changes if prompted.

## 5. Test

1. Check `/health`: `configured` should be true.
2. Install the app from its GitHub settings → Install App. Choose **Only select repositories**. Prefer a separate test game repo; selecting renpy-live temporarily also permits a connectivity check.
3. Open the editor site, enter the Worker URL, and open the connection dashboard.
4. Click Sign in with GitHub. Verify your username and selected repository appear.
5. Sign out and verify the dashboard no longer shows a session.

Authentication is initially tested on the Worker origin. GitHub Pages and workers.dev are different sites, so a browser may block cookies on cross-site API calls. Before adding authenticated editing within the SPA, implement a deliberate same-site deployment or a secure browser-session bridge. Do not simply enable credentialed CORS and assume it works.

Sessions expire after at most eight hours; re-login replaces them. Refresh tokens are not retained yet. Logout clears this browser's cookie; uninstalling/revoking the app handles GitHub access revocation.

## Later permissions

Publishing needs separate permissions for Actions/Pages, and writing workflow files requires Workflows access. Add them when those features are implemented. Repository creation with a GitHub App also requires validating the endpoint's supported token and Administration permissions. The starter does not create repositories automatically.

LFS assets need an LFS-aware upload implementation and build checkout. LFS cannot be used directly in template repositories; keep a template limited to ordinary scaffold files, then configure LFS in each newly created game repository.
