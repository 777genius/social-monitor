# Durable backend HTTP capture boundary · 2026-11-10

## Original baseline, accounting and scope

Main commit `5d34b97a66f53a40400651df469e359e38d8bb4e`. Move 176 physical lines of original HTTP request, status, JSON parsing and rate-limit polling from the 2,286-line `scripts/capture-durable-backend-e2e-loop.ts` into one `scripts/lib/durable-backend-e2e-http-client.ts`. This is an original-source move, **not net deletion**. Count conservative unique nonblank original implementation lines only once after full postmerge E2E. Ratchet only the original script's source limit to 2111.

## Exact boundary

CLI owns configuration loading, tenant/workspace headers and secrets, DB setup, all orchestration and artifact writing. New client owns four previously adjacent HTTP/polling methods and their three private helpers plus error type. One factory receives the original `config.apiBaseUrl` and original `isRecord`/`delay` callbacks; it does **no network I/O at construction time**. Request URL, lazy fetch, methods, JSON body, headers, status, errors, 429 retry precedence/deadline and timeout text are preserved. No new store, schema, dependency, feature flag, auth, production, SSH or deploy changes.

## Independent critical review passes (initial)

1. **SOLID / simplicity:** retain only one cohesive client, not a new HTTP framework. Orchestrator retains every business decision and error-handling call site.
2. **Security / behavior:** preserve original fail-closed object validation, 429 recovery and error messages; never log credentials. Client closes over the original dependencies without duplicating state.
3. **Tests / integrations:** mock fetch with deterministic request/status/error/rate-limit cases, guard the exact CLI bridge. Wire new tests ahead of the original source cap; all existing CI gates stay enabled.

## Acceptance before merge

- [ ] Exact-head Draft Static/Security/Flutter CI and API image from original jobs.
- [ ] Independent source/security review and all material findings resolved.
- [ ] Ready exact-head full **20/20** original jobs, no skip/fail, plus API image.
- [ ] SHA-guarded safe squash merge and postmerge current main **20/20**; only then credit original moved LOC.
