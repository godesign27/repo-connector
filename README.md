# repo-connector

Standalone module that grants **read-only** Git repository access to an external system through a GitHub App install. Every install lands in `pending` and stays unusable until an admin explicitly approves it. There is no auto-approval path.

Docent (and later other products) consume this as a **package or HTTP API**. This repo has zero Docent-specific imports.

GitLab and Bitbucket are not implemented. The public `RepoConnector` interface is provider-agnostic so they can be added later without changing caller signatures.

## Public interface

```ts
import type { RepoConnector } from "repo-connector";

// requestInstallation(clientId) -> install URL (status is always pending)
// getInstallationStatus(clientId) -> pending | approved | rejected | revoked | not_found
// approveInstallation(clientId, { actor })  // admin
// rejectInstallation(clientId, { actor })   // admin; can later re-approve
// revokeAccess(clientId, { actor })         // blocks tokens; can later re-approve
// getAccessToken(clientId)                  // only if approved + in-policy
// listAccessibleRepos(clientId)             // only if approved + in-policy
```

Hard gate: `getAccessToken` and `listAccessibleRepos` throw unless status is `approved` **and** recorded permissions are within `contents:read` and `metadata:read`. Broader installs are flagged and cannot mint tokens even if someone clicks Approve.

Installation tokens are minted on demand from the GitHub App JWT. They are short-lived (~1 hour). The installation id is encrypted at rest; tokens are not stored as long-lived secrets.

## Run locally

```bash
cp .env.example .env.local
npm install
npm test
npm run dev
```

The app listens on `http://127.0.0.1:43127`.

Default `.env.local` uses `CONNECTOR_MODE=mock`:

- Admin secret: `dev-admin-secret`
- Product API key: `dev-api-key`
- Mock install URL completes the GitHub callback against this server
- Mock tokens and two sample repos (`acme/design-system`, `acme/docs`)

Open `/admin`, sign in, create a client id, complete the mock install, then approve.

## HTTP API

All product routes require `Authorization: Bearer $REPO_CONNECTOR_API_KEY`. Approve / reject / revoke also accept the admin session cookie. Send `X-Actor` to name the caller in the audit log.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/installations/:clientId/request` | Create pending install + URL |
| `GET` | `/v1/installations/:clientId` | Status snapshot |
| `POST` | `/v1/installations/:clientId/approve` | Admin approve / re-approve |
| `POST` | `/v1/installations/:clientId/reject` | Admin reject |
| `POST` | `/v1/installations/:clientId/revoke` | Revoke access |
| `GET` | `/v1/installations/:clientId/token` | Short-lived installation token |
| `GET` | `/v1/installations/:clientId/repos` | Repos visible to the install |
| `POST` | `/api/webhooks/github` | GitHub App webhook |
| `GET` | `/install/callback` | GitHub App setup URL |

TypeScript clients can import `RepoConnectorClient` from `repo-connector` (same method names) or embed `createConnector` from `repo-connector/core`.

## GitHub App setup

Create a GitHub App with **only**:

- Repository permissions: **Contents: Read-only**, **Metadata: Read-only**
- No write, admin, or extra permissions

Configure:

- Setup URL: `https://<your-host>/install/callback`
- Webhook URL: `https://<your-host>/api/webhooks/github`
- Webhook secret: same as `GITHUB_WEBHOOK_SECRET`

Then set `CONNECTOR_MODE=github` plus `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (PEM; `\n` escapes are fine), and `GITHUB_WEBHOOK_SECRET`.

## Docent ingestion (integration note)

Do **not** import Docent into this repo. In Docent’s ingestion step, call repo-connector as an HTTP client (or import the SDK) after an admin has approved the install.

```ts
import { RepoConnectorClient } from "repo-connector";

const connector = new RepoConnectorClient({
  baseUrl: process.env.REPO_CONNECTOR_URL!, // e.g. http://127.0.0.1:43127
  apiKey: process.env.REPO_CONNECTOR_API_KEY!,
  actor: "docent-ingestion",
});

const clientId = `docent:${tenantId}`;

const { installUrl, status } = await connector.requestInstallation({ clientId });
// Send the user to installUrl. Status is pending until an admin approves.

const current = await connector.getInstallationStatus(clientId);
if (current !== "approved") {
  throw new Error(`repo-connector status is ${current}; ingestion cannot start`);
}

const { token, expiresAt } = await connector.getAccessToken(clientId);
const repos = await connector.listAccessibleRepos(clientId);
// Use `token` against the GitHub API until expiresAt, then call getAccessToken again.
void token;
void repos;
```

Equivalent HTTP:

```bash
curl -sS -X POST "$REPO_CONNECTOR_URL/v1/installations/docent:tenant-1/request" \
  -H "Authorization: Bearer $REPO_CONNECTOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"github"}'

curl -sS "$REPO_CONNECTOR_URL/v1/installations/docent:tenant-1" \
  -H "Authorization: Bearer $REPO_CONNECTOR_API_KEY"

# After an admin approves in /admin:
curl -sS "$REPO_CONNECTOR_URL/v1/installations/docent:tenant-1/token" \
  -H "Authorization: Bearer $REPO_CONNECTOR_API_KEY"

curl -sS "$REPO_CONNECTOR_URL/v1/installations/docent:tenant-1/repos" \
  -H "Authorization: Bearer $REPO_CONNECTOR_API_KEY"
```

Ingestion should treat `pending`, `rejected`, `revoked`, and `not_found` as hard stops. Never store the installation token as a permanent credential; mint a new one when it expires.

This task does not modify the Docent repository.

## Admin

`/admin` is a single-secret queue: list installs, approve / reject / re-approve / revoke, and read the audit log. It is not a product surface.

The admin UI uses the [agentic-ui-shadcn](https://github.com/godesign27/agentic-ui-shadcn) token set and `ui:*` components (`button`, `card`, `input`, `label`, `badge`, `table`, `separator`, `scroll-area`). AI-namespace components are not used — this is human-authored product UI.

## Out of scope

Public marketing site, self-serve signup, billing, multi-admin roles, and GitLab/Bitbucket implementations.
