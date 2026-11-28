# Reader promotion consumer-owned assessment snapshot — Stage B1

Status: **Consolidated into #793 / merge HOLD**. Stage A (#790) is merged; this stage (#791) must not merge separately. This stage intentionally changes no runtime behavior.

## Observed baseline
- Four exact `summary/domain` files refer to `relevance/domain/reader-value/reader-value-assessment`. Three of them import **only a type** named `ReaderValueAnswers`; the fourth calls `validateReaderValueAnswers` at runtime and is **out of scope**.
- The three type-only consumers are `reader-post-promotion-v3.ts`, `reader-promotion-ranking.ts` and `reader-post-promotion-policy-contract.ts`.
- Existing #665 changes 741 files but does not change these three domain source paths. Do not touch model adapters or source extraction here.

## Scope and invariants
1. Define a summary-owned **immutable structural answer snapshot type** that carries only the existing four criterion choices, their probability dictionaries, confidence, argmax-divergence and tie flags. No new persisted representation, DTO or JSON serialization.
2. Replace the three type-only imports with this local type; leave the remaining runtime validation dependency in the exact historical allowlist. The new type must be **mutually assignable** to the relevance provider's current `ReaderValueAnswers`, including each choice literal.
3. Add compile-time type-parity assertions and Jest data-parity tests at an **adapter boundary**, which may depend on the foreign provider contract. No inner-layer import from relevance is allowed.
4. Remove exactly three obsolete `(source path, module specifier)` entries from #790's ratchet. Seven historical edges remain and are separate migrations.
5. Preserve all output, digest, attestation and ranking semantics, including unknown/insufficient choices, non-argmax and probability ties; do not revalidate or renormalize at this seam.

## Review rounds before merge
- Scope/DDD: keep source-of-truth validation in relevance; the summary snapshot is a read-only consumer view, not a second validator.
- Type safety: both directions of type assignability; runtime label-array equality to detect any future provider vocabulary change.
- Security: no new dependency, no provider calls, no tenant/security context alteration or runtime branching.
- Regression: full final-head `check:architecture`, typecheck, source cap, focused Jest, native PostgreSQL18/backend E2E and security success; skipped/queued/cancelled are not PASS.
- Integration: preserve the merged #790 baseline and #665 changes; qualify consolidated #793 against current `main` at its exact final head, including all required checks and independent review. Use an ordinary merge commit with expected-head protection to preserve #801 ancestry, then verify main-push native 20/20 and API image success.

## Exclusions
No changes to `validateReaderValueAnswers`, archived GitHub trending validation, `delivery` or `conversation` contracts; no schema, payload or persistence change. No Foundation/Get Modular/toolchain update here. Those belong in separately reviewed steps in #790's program.
