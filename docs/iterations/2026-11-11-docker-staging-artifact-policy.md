# Docker staging artifact policy — 2026-11-11

## Scoped extraction
Pinned baseline `cd04d1e3814bfec9138b615a2fff629c2b520df6`. Move six existing metadata-only artifact validators unchanged except factory indentation from `scripts/check-docker-backend-staging-evidence-bundle.mjs` to `scripts/lib/docker-staging-artifact-policy.mjs`. Count original nonblank source LOC (not diff additions/net deletion).

## Three critique angles
1. **Architecture:** static provenance, redaction, count, forbidden-fragment and runtime-service validation share one purpose-specific policy. The script still owns filesystem, environment, permissions, fixture generation, runner sequencing and process exit; no second state store.
2. **Behavior and safety:** preserve literal-false redaction requirements, required service IDs, exact diagnostic text/order, minimum counters and duplicate handling. Factory receives original mutable `violations` array and references; no changed I/O timing, credentials or deployment.
3. **Testing and integration:** focused positive/negative tests run before original checker in its existing npm gate. Separate source from #749 durable scan-targets, #665 model refactor, and #620 production deploy. Do not bypass security gates, force-push or override SSH.

## Required acceptance
Draft quality/security/Flutter + independent review; Ready exact HEAD native 20/20; CAS-guarded merge; main postmerge 20/20. None may be claimed before the actual GitHub evidence. No production deployment.
