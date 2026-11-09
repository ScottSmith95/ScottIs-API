# API review — 2026-10-27

Scope: the API repository; the front end was read only to confirm its request and response contract. Existing local changes adding timestamps, fast notification dispatch and optional webhook configuration were retained in the revised implementation. No production data or deployment settings were changed.

## Fixed in this working tree

| Priority | Finding | Change |
| --- | --- | --- |
| P2 | GET deletion links could be followed automatically by notification previews. | Render a confirmation on GET and delete only on POST. Deletion remains unauthenticated by user preference. |
| P1 | A resolved `false` storage write was reported as success. Cloudflare errors could be interpreted as response data and written back. | Validate HTTP status, response shapes and write acknowledgements; return a generic 503 and never overwrite invalid storage. |
| P2 | Missing/non-string bodies crashed `.trim()`, and the 20-character rule was only enforced by the browser. | Validate input before any storage calls; reject oversized or empty sanitized text. |
| P2 | Origin substring matching allowed lookalike domains and any `now.sh` tenant. | Match the domain boundary and HTTPS scheme; use explicit additional origins for previews and local development. |
| P2 | IP bans compared the whole forwarded chain instead of the client address. | Parse the first forwarded address and fail closed if ban data cannot be read/validated. Assumes Vercel supplies the trusted forwarding header. |
| P2 | Storage reads could throw outside error handling, and requests had no upstream deadlines. | Catch storage errors, use bounded requests, and avoid returning upstream errors or secrets. |
| P2 | Background webhook promises could be abandoned after returning; `allSettled().catch()` did not detect individual failures. | Register work with `waitUntil`, inspect settlement results, check webhook HTTP status, and preserve fast POST responses. |
| P2 | Direct function paths lacked method guards; JSON CORS preflight was not routed. | Guard every handler and route OPTIONS explicitly through the response handler. |
| P2 | Invalid limits had surprising slicing/coercion behavior. | Accept only positive safe integers. |
| P2 | The default root output directory packaged server source files and tests as public static files. | Restrict static output to `public/`; verify the built artifact contains only `robots.txt`. |
| P2 | Dependency audit reported three vulnerable development packages. | Update direct/transitive dependencies and pin the added Vercel helper to a clean release. |
| P3 | Configuration depended on the process working directory; lint warnings did not fail checks. | Resolve package metadata relative to the module and make lint strict. |

## Remaining findings

Deletion intentionally remains unauthenticated by user preference. Repository privacy does not restrict the deployed endpoint; anyone with a response timestamp can send a deletion POST. No secret or signing setup is required.

### P1 — concurrent writes can lose responses or restore deletions

`utilities.js` stores every response in one `responses` KV value. Creation and deletion read a snapshot, modify it, and replace the entire value. Two requests reading the same snapshot can both report success while the last write discards the other's changes. A submission using a stale snapshot can also restore a deleted response. Checking timestamp collisions within one snapshot does not fix concurrent writes or duplicate races.

Cloudflare documents that KV is eventually consistent and does not provide atomic read/modify/write transactions ([KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)). Fix this with a storage migration to transactional records, for example D1 with a unique normalized-response constraint, or a Durable Object that owns authoritative state and serializes mutations. A process-local lock or merely retrying PUT is insufficient across serverless instances. This review does not silently migrate live data or claim to resolve the race.

### P2 — anonymous submissions have no rate limit or bot verification

The ban list and browser origin check are not authentication or spam prevention. A non-browser client can omit or forge Origin, and an unbanned client can submit repeatedly, consume storage API capacity and trigger notifications. Add a platform rate limit covering both the versioned POST route and `/api/responses_post` (including `.js` if exposed), with an appropriate burst and sustained allowance; consider server-verified Turnstile if abuse warrants it. This requires a deliberate policy and deployment configuration, not an in-process counter. No live protection settings were inspected or changed.

### P2 — every request transfers and processes the full dataset

The `limit` parameter restricts the response after the complete KV value is downloaded. Posts and deletes also rewrite the entire dataset. Cost and latency grow with history, and the whole value can eventually reach storage/function limits. Transactional per-response records with indexed cursor pagination address this alongside the concurrency problem. Keep the current response map during migration so the front end can be upgraded separately.

### P3 — notifications remain best effort

`waitUntil` retains background work for the function lifetime, but does not provide persistent retries ([Vercel documentation](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil)). A queue/outbox is needed if delivery must be guaranteed across outages or function termination.

## Before deployment

1. Deletion links open a confirmation page and require no additional configuration. Existing timestamp links continue to work.
2. Use Node.js 24.x. Set exact `ALLOWED_ORIGINS` entries if particular preview or local origins need to submit; generic shared-hosting domains are no longer trusted.
3. Prefer a scoped `CF_API_TOKEN` over the legacy global API key. The old credentials remain supported to avoid an unplanned credential migration.
4. Verify that `responses` is a timestamp-to-string object and `bans` is an array in the target KV namespace. Invalid/missing data now fails closed.
5. Smoke-test the deployed routing, browser form submission and moderation confirmation against a separate preview namespace before promotion. Local regression tests mock external services; they are not evidence of a live deployment test.

## Verification completed

- `npm test`: strict lint and 31 regression tests pass, including response contracts, input validation, failure paths, background lifecycle registration, and deletion/confirmation.
- October 27 `npm audit --json`: zero reported vulnerabilities at that time. The November 8 release recheck reports four moderate findings from one development-only minimatch advisory in the ESLint dependency chain; production dependencies remain clean. Current ESLint 10.14.0 still requires the affected minimatch major. No forced override or tooling downgrade is included; follow [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) for the upstream fix.
- `vercel build --non-interactive`: local preview build succeeds. Artifact inspection confirms all three functions target Node.js 24 with a 60-second budget and include the package metadata needed by configuration. Public output contains only `robots.txt`, with no server source or tests.
- `git diff --check`: clean.
- The linked Vercel project's existing Node setting is 22.x; the new package engine selects 24.x for these builds. Preview settings were downloaded locally for the build. No deployment, production request, notification delivery or live storage mutation was performed.

## Release preparation — 2026-11-08

The existing JSON GET/POST contracts and native-form 303 redirects are preserved. The API supports the front-end build-time snapshot without further changes. Release the frontend status banners before pushing this API commit to `main`, which is the linked Vercel production branch. Re-run the production build through Git integration rather than uploading preview build artifacts.
