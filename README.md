# ScottIs API

Vercel Node.js functions backing [scottsmith.is](https://scottsmith.is). Responses and IP bans currently live in Cloudflare Workers KV. The current API version is `v1.5`; `v1.4` routes remain available for compatibility.

## Development and verification

Use Node.js 24.x, install dependencies with `npm ci`, and run `npm test` for lint and regression tests. `npm run lint` runs lint alone. `npm run dev` requires the Vercel CLI and a linked project. Copy `.env.example` to `.env.local` and fill in local settings; keep credentials out of Git. Tests use an in-memory mock of the storage API and webhooks and do not contact production.

The KV namespace must already contain `responses` (a JSON object mapping millisecond timestamp strings to response strings) and `bans` (a JSON array of IP strings, possibly empty). Missing keys, invalid data and failed upstream requests produce a controlled 503 rather than silently resetting storage. Initialize keys only when creating a new empty namespace, never over existing data.

## Environment

| Variable | Purpose |
| --- | --- |
| `CF_ACCOUNTID`, `CF_KV_NAMESPACEID` | Account and existing KV namespace. |
| `CF_API_TOKEN` | Preferred scoped token for KV reads/writes; takes precedence over legacy credentials. |
| `CF_AUTH_EMAIL`, `CF_AUTH_KEY` | Existing global-key authentication, used only when no token is set. |
| `BASE_URL` | API origin, default `https://api.scottsmith.is/`; set appropriately for preview environments. |
| `SLACK_WEBHOOK`, `PUSHCUT_WEBHOOK` | Optional notification destinations. |
| `ALLOWED_ORIGINS` | Optional comma-separated exact browser origins for local development or specific previews. HTTPS `scottsmith.is` and its subdomains are already allowed. |

## HTTP contract

- `GET /v1.5/responses`: timestamp-to-string object in chronological order. Optional `limit` is a positive integer selecting the newest N entries. Invalid/repeated limits return 400. No limit returns the whole dataset for compatibility.
- `POST /v1.5/responses`: accepts a parsed JSON or URL-encoded body with a string `response`. Trimmed input must be 1–20 UTF-16 code units, matching the front end's JavaScript length check. Existing punctuation/tag cleanup is retained. Success returns 200 with `status`, sanitized `response` and numeric `timestamp`. Case-insensitive duplicates retain 202 for the current front end. Invalid input returns 400, blocked origins/IPs return 403, and storage failures return 503.
- Native URL-encoded form submissions that accept HTML receive a bodyless `303` redirect to the validated request origin (or `https://scottsmith.is` when absent), with `/#sent`, `/#duplicate`, or `/#error`. The frontend owns those static status messages. Explicit `Accept: application/json`, wildcard clients, and JSON request bodies keep the JSON contract above. Failed native submissions require Back to recover text; input is never included in redirect URLs.
- `OPTIONS /v1.5/responses`: public CORS preflight for GET/POST and the Content-Type header. Public response handlers also support direct function paths with method checks.
- `GET /v1.5/delete_response/:timestamp`: renders a confirmation form. GET never changes data, including when followed by a notification preview crawler.
- `POST /v1.5/delete_response/:timestamp`: deletes that record. Success is 200, missing record 404, invalid timestamp 400, and unavailable storage 503. Direct `/api/delete_response?timestamp=...` requests behave the same way.

Deletion links need no additional configuration and do not expire. Deletion is intentionally unauthenticated: anyone who knows a response timestamp can submit a deletion request. The confirmation page prevents accidental deletion by GET previews; it is not access control.

Notification work uses Vercel `waitUntil`, runs concurrently, and has a five-second deadline per destination. Failures are logged without changing the result of an already-saved submission. Delivery is best effort, without retry or a durable queue. Storage calls have eight-second deadlines; functions have a 60-second budget.

## Dependency notes

The October 27 dependency update uses: semver 7.8.5, ESLint 10.13.0, globals 17.13.0, and @eslint/js 10.0.1. The lockfile also refreshes transitive packages. Node 24.x matches the tested runtime and the lint tools' requirements.

`@vercel/functions` is deliberately pinned to **3.6.1**. During this review, latest 3.10.4 pulled in a vulnerable Zod dependency through `@vercel/oidc` and `@vercel/cli-config` ([advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). The pinned version provides `waitUntil` without that vulnerable dependency chain. Revisit the pin when upstream fixes its dependency chain; do not force an incompatible Zod major version into it.

The November 8 release check found one new moderate advisory in the development-only minimatch dependency, reported across four packages in the ESLint chain. Production dependencies remain clean. The latest ESLint 10.14.0 still requires the affected minimatch major; no forced override or downgrade is included. See [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

See [API_REVIEW.md](API_REVIEW.md) for remaining architecture and abuse-control issues.
