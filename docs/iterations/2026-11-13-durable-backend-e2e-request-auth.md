# Durable backend E2E request authentication boundary (scoped draft preparation)

Base: `a82bfefbcc2240dd671c46aa090d706cc96447f7`. The canonical #760 post-merge main run must complete 20/20 successfully before opening a new Draft PR; current separate model PR #665 remains outside scope.

## Scope and original-line accounting
Move exactly **60 original nonblank implementation lines** from `scripts/capture-durable-backend-e2e-loop.ts` into `scripts/lib/durable-backend-e2e-auth.ts` (JWT resolution/signing 40, request-header builder 8, idempotency header 9, JSON encoder 3). The five-line `AuthContext` type also relocates but is **excluded** from that implementation count. New tests, imports, documentation, comments, formatting, and net deletions are not counted. Counter remains provisional until complete exact-head Ready E2E and post-merge verification. Existing runner 1683 physical LOC becomes 1621; the source cap ratchets accordingly.

## Critical architecture and safety reviews
1. **SRP / Clean Architecture:** the orchestration runner retains its process lifecycle, config acquisition, call sites and request ordering. Exactly one module owns opaque bearer pass-through, RSA JWT signing and HTTP request scope/idempotency headers. No new config store, runtime service or dependencies. Structural test rules out retained duplicate implementations.
2. **Security / behavior:** original function bodies and diagnostics are relocated without rewriting control flow. The only code edits inside original declarations are `export` and structural narrowing of the token signer input type. Explicit-bearer precedence, required-key failure, RSA-SHA256 signature, JWT field order, `iat/exp`, tenant/workspace scope, per-request UUID and header cloning remain unchanged. Test with synthetic local RSA keys and verify signature/tamper rejection; never log keys or call real identity providers.
3. **Testing / E2E:** seven focused tests cover bearer precedence, missing key failure, JWT validity, malformed signer input, tenant/workspace headers, idempotency immutability, and runner delegation. Preserve existing auth/tenant isolation and post-merge E2E. Exact-source 20/20, independent review, SHA-guarded merge, then native post-merge 20/20 and nonpublishing API image remain mandatory. No deploy, SSH change, disabled guard, or #665 writes.

## Pre-PR gate
A preparation branch is not a qualified or ready-to-merge PR. Do not claim focused-hosted PASS until actually observed; do not open a PR or count LOC until #760 postmerge run is fully accepted.
