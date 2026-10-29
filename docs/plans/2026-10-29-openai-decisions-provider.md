# OpenAI Decisions as a second reader-value scoring provider

Date: 2026-10-29. Baseline: `main` at `156ed0b77c2854e7b7b0f6bf28b3c792c2e1cc67`.

Status: implementation plan awaiting two rounds of independent multi-critic review. This document authorizes no implementation before those reviews and the coordinating agent's approval. The user has authorized the complete implementation, bounded live tests with their temporary key, a draft PR, pushed commits, final independent review and fixes, and merge after required checks pass.

## Outcome and scope

Add OpenAI Decisions as a selectable implementation of the existing `ReaderValueScorer` contract. An installation can assess collected reader content with either the current OpenRouter SystemOne/Jev provider or OpenAI Decisions. Both produce the same four domain answers, use the same source safety policy and qualification rules, and travel through the existing durable assessment and summary preparation pipeline.

Keep OpenRouter SystemOne/Jev as the default scoring provider. Add one explicit configuration selector, `READER_VALUE_SCORING_PROVIDER=openrouter-systemone|openai-decisions`. It selects an external provider; it is not a rollout flag. OpenAI uses the supported `gpt-6-luna` model, fixed in the versioned provider configuration. Do not add an arbitrary model registry or a model-name environment override.

Preserve the historically named `READER_VALUE_MODE=legacy_v2|jev_shadow|jev_primary_v3` modes. These choose the assessment/summary workflow independently of the scoring provider. Document that `jev_primary_v3` also runs with OpenAI Decisions. Preserve credential-free self-host startup and `--without-ai` behavior.

This is a reader-value scoring integration. Summary presentation and final writing continue through the existing agent-runtime path. There is no frontend provider management, user-level provider setting, cross-provider fallback, dual scoring, cache migration, database backfill, historical replay framework, or unrelated provider refactor. The repository has no users requiring a compatibility rollout. Before changing providers on an existing deployment, finish its frozen jobs with the old configuration, then change the selector consistently across relevant processes.

## Verified starting points

- `libs/relevance/application/contracts/reader-value-assessment-store.ts` defines the scorer, immutable prepared request, accounting and durable store contracts.
- `libs/relevance/infrastructure/reader-value/reader-value-input-builder.ts` captures a conservative source snapshot, clips Unicode safely, serializes the exact HTTP body, and hashes request and input identity. It currently imports Jev-only model constants.
- `libs/relevance/infrastructure/reader-value/openrouter-reader-value-scorer.ts` makes one bounded HTTP attempt. The assessment worker already owns leases, dispatch authorization, retries, pause decisions and lost-acknowledgement recovery.
- `libs/relevance/domain/reader-value/reader-value-rubric.ts` owns the four questions: `usefulness`, `relevance`, `context_sufficiency`, `evidence_basis`. `reader-value-assessment.ts` validates all questions and labels, finite probabilities, confidence and probability sums. It preserves the provider's declared choice, including a choice that differs from the maximum probability.
- `PrepareReaderValueSummaryUseCase.configuration()` currently advertises Jev constants independently of its injected builder. The worker, V3 preflight composition and daily capture qualification also instantiate Jev builders directly. All must agree on the selected configuration.
- The Prisma schema persists provider, model and version identifiers as strings. `error_code` is text. No schema migration is expected; verify this with the actual store and database fixture rather than introducing migration work preemptively.
- The existing PostgreSQL fixture creates an isolated local test database, uses the production Prisma connection/store path and enforces scoped runtime access. Its baseline + RLS helpers + assessment migration are a partial migration fixture, not certification of the complete historical migration chain.
- `scripts/capture-durable-reader-summary-from-postgres.ts` is already 994 lines. Keep provider details in focused existing/new helpers; split responsibility before an edit would exceed the 1000-line cap.

## External API contract

Rechecked against official documentation on 2026-10-29:

- [Decisions guide](https://developers.openai.com/api/docs/guides/decisions): `POST https://api.openai.com/v1/decisions`; the currently supported model is `gpt-6-luna`. Structured evidence can be passed as a user-message `input_json` part with the object in `data`.
- [Create decision reference](https://developers.openai.com/api/reference/resources/decisions/methods/create): named choice questions use an array of `{ value, description }` choices. Returned choice answers have a name, choice, confidence and an array of `{ value, probability }` entries. A named question can instead return `type: "refusal"`. The response includes model and token usage; do not require a Jev-style provider field, response id or billed cost field.

Use this documented Decisions endpoint directly with the existing `fetch` approach. No new SDK dependency or Responses adapter is needed. An SDK's automatic retries would duplicate the worker's retry ownership.

## Architecture and identity

### 1. Shared domain rubric, explicit prepared-input configuration

Keep the domain rubric, labels and answer validator provider-neutral. Add a small immutable application-owned configuration type containing the prepared-input identity fields needed by the workflow: rubric version/hash, input-builder version, model-configuration version and requested model. It contains no environment reads, credentials, HTTP DTOs or infrastructure classes.

Expose the selected immutable identity through `ReaderValueInputBuilder.configuration`. `PrepareReaderValueSummaryUseCase.configuration()` reads this metadata from its injected builder rather than importing Jev model globals. Update affected fake builders to implement the same contract. This avoids a separate constructor parameter that can silently disagree with the actual builder. The existing preparation comparison still rejects any later prepared input that disagrees with the frozen configuration, including an empty inventory where no candidate could reveal a mismatch.

Keep provider request formatting in relevance infrastructure. Use two explicit versioned provider definitions/request formatters, selected at composition. Reuse the current conservative capture/clipping/identity algorithm. A provider formatter changes only the wire envelope and corresponding identity, not the rubric, safety rules or eligibility policy. Do not embed a growing provider switch in use cases.

Preserve the current Jev configuration versions and serialized request bytes where behavior is unchanged. Give Decisions a distinct model-configuration version and input-builder version, for example `openai-decisions.gpt-6-luna.reader-value.v1` and `reader-value-input.openai-decisions.v1`. Names may be shortened during implementation, but tests must enforce separation. Rubric version/hash stay common because the questions and labels are unchanged.

Input and request hashes continue to bind the exact serialized body, interest digest and source snapshot. Source revision binding remains the existing preparation behavior. The same source/interest scored through different providers must produce different request/input hashes and separate assessment rows; neither provider may satisfy the other's exact reuse lookup.

### 2. Decisions request format

Serialize one request per source/interest, with all four questions:

```json
{
  "model": "gpt-6-luna",
  "input": [{
    "role": "user",
    "content": [{
      "type": "input_json",
      "data": {
        "trusted_interest": "...",
        "title": "...",
        "source_text": "...",
        "context_state": "complete"
      }
    }]
  }],
  "questions": [{
    "name": "usefulness",
    "type": "choice",
    "instructions": "<the existing rubric instructions>",
    "choices": [{ "value": "noise", "description": "<the existing criterion>" }]
  }]
}
```

The example abbreviates the four questions and all their existing labels. Derive both provider formats from `readerValueQuestions`; do not maintain a second prompt or label catalog. Trusted classification instructions remain in the question definition; title and source text remain explicitly untrusted evidence under the existing rubric.

Retain the current conservative 28,000-byte state-plus-largest-question and 56,000-byte total request ceilings, 2,000-character title bound, Unicode-safe clipping and terminal diagnostic envelopes. Measure the selected provider's actual serialized request, including its envelope. Blocked/empty sources and invalid configuration must still become the existing zero-dispatch terminal records.

### 3. One bounded Decisions scorer

Add `libs/relevance/infrastructure/reader-value/openai-decisions-reader-value-scorer.ts`, implementing only `ReaderValueScorer`. Inject credentials, `Clock` and optional `fetch` transport. The adapter reads no environment variables and performs no database or retry operations.

Before HTTP, reject terminal inputs without sending. For runnable inputs validate the selected requested model, model-config version, input-builder version, rubric version/hash, request digest and byte ceiling. Validate that the serialized provider envelope actually contains the configured model and exact expected questions/choices, so independently altered metadata/body cannot dispatch under the wrong identity. Send the already prepared `requestBody` unchanged; do not reconstruct it at dispatch.

Use the fixed HTTPS Decisions URL, POST, `redirect: "error"`, bearer auth and `AbortSignal.timeout(30_000)`. Read no more than 256 KiB of response, cancel an oversized stream, and make exactly one transport call per attempt. If extracting a bounded-body helper would remove real duplication with the Jev scorer, keep that helper local to reader-value HTTP infrastructure and preserve existing Jev semantics with regression tests. Do not introduce a general HTTP framework.

Require a response object with the configured model. Record the returned model as `resolvedModel` and the known adapter identity as `provider: "OpenAI"`; no payload provider field is required. The documented model name is an alias, not a claim of immutable underlying model weights. A different returned model is `model_version_changed` and pauses dispatch until configuration is reviewed.

Map the answer array to the existing keyed domain format. Reject missing, duplicate or unexpected question names, non-choice types, duplicate or unexpected probability labels, missing labels and non-string choices. Pass the mapped result to `validateReaderValueAnswers`; do not normalize probabilities, substitute argmax, round confidence or salvage partial assessments.

Recognized refusals of an expected question become a new stable `provider_refused` domain failure: `retryable: false`, `pauseDispatch: false`. Persist that item as terminal and allow other work to continue. Structural corruption, unexpected names/types and invalid probabilities remain schema failures that pause dispatch. Validate names/uniqueness before treating a response as a legitimate refusal so arbitrary malformed data cannot bypass schema checks. The complete assessment still requires all four answers; no partially assessed result is saved.

Reuse `readerValueHttpFailure` for 429/Retry-After, authentication/billing pause, timeout/server/transport retry and permanent request rejection. Preserve status-based failure classification even when the error body is malformed or too large. Refusal is distinct from HTTP rejection. Never retain raw provider error messages, response bodies, authorization headers or source text in diagnostics.

### 4. Honest accounting

Read safe nonnegative integral token counts when present; zero output tokens is valid. Missing or invalid counts stay null. Capture a bounded/sanitized `x-request-id` header when available; response JSON need not have an id. Measure nonnegative latency using the injected clock.

Set Decisions `costUsd` to null because the documented response does not supply billed cost. Keep `usageUnknown: true` when billed cost is unknown, even if both token counts are available. Do not multiply list prices into a value presented as provider billing, and do not treat missing cost as zero. Keep the existing Jev billed-cost normalization behavior unchanged. Confirm null cost and unknown usage survive actual Prisma persistence and exact reuse.

## Composition, activation and configuration consistency

Put environment parsing in a relevance composition/provider-token resolver following existing repository conventions. Validate the selector against exactly the two supported providers and export a reusable resolved provider/configuration choice. Separate identity/builder selection from credential resolution: summary preparation must not need the scoring API key or instantiate a scorer. Require only the selected provider's nonempty key when the scoring loop is enabled: `OPENROUTER_API_KEY` for Jev, `OPENAI_API_KEY` for Decisions. Disabled/no-AI paths must not require either key. Do not choose a provider implicitly from which key happens to be present.

Thread that same selected builder/configuration through:

1. `apps/intelligence-worker/src/reader-value.module.ts`: discovery builder, scorer and tick `modelConfigVersion` must come from the same resolved selection.
2. `libs/summary/adapters/composition/reader-summary-v3-composition.ts` and `libs/summary/interfaces/rest/summary-reader-summary-v3.providers.ts`: preflight receives the selected builder rather than constructing Jev unconditionally. Preserve application-to-contract dependency direction and app alias imports.
3. `scripts/lib/reader-summary-daily-jev-qualification.ts`, the durable capture entry point and `scripts/lib/reader-summary-v3-postgres-production-preflight.ts`: runtime capture/preparation uses the selected builder. Keep legacy class/helper/mode names unless a narrow rename materially improves correctness.
4. Tests and fixture composition that intentionally exercise Jev: select Jev explicitly where needed; shared parameterized fixtures also exercise Decisions. An audit search for Jev constants and builder construction must distinguish intentional regression fixtures from unthreaded production consumers.

Add the selector and its default to `.env.example` and a short operator guide. Show the complete prerequisites for V3 scoring (Prisma relevance/summary persistence, assessment loop, due poller and separate agent-runtime summary writer). Show that provider changes require matching configuration across worker, API/preflight and capture processes; mixed configuration fails closed through the existing frozen config/manifest checks.

For usable optional self-host activation, extend the existing launcher/config flow minimally: `--scoring-provider openai-decisions --openai-key-file PATH`, preserving the existing OpenRouter command and default. Pass the selection through `scripts/quickstart/setup.ts` and `AiConnection` in `scripts/quickstart/local-config.ts`; emit only the selected provider key into private `scoring.env` and the nonsecret selector into shared backend config. Keep current private file permissions, existing local settings behavior and credential-free startup. Do not add prompts, account login, extra UI or settings migration machinery. Cover current and new commands in `docs/reference/self-hosting.md` and focused launcher/config tests.

## Implementation sequence and review gates

1. Publish this plan in an immediate draft PR. Conduct round one with at least two independent critics, covering architecture/scope and API/runtime/testing. Resolve each actionable finding in this document. Conduct a second round with multiple independent critics against the revised plan, resolve findings, and obtain coordinating-agent approval before code changes.
2. Implement shared configuration/formatter selection and builder metadata, then remove Jev globals from summary preparation. Preserve Jev request/identity regression evidence.
3. Implement the Decisions scorer and narrow response mapping/failure/accounting tests. Add the refusal code and verify worker behavior without adding a new retry layer.
4. Wire worker, summary preflight, capture and minimal activation paths. Add runtime guard coverage and exact provider selection tests.
5. Add deterministic production-pipeline integration, then run the bounded opt-in live pipeline against the isolated PostgreSQL fixture using the temporary key. Record only redacted evidence, actual request counts and stated limits.
6. Run required focused gates, push logical commits to the draft PR as work becomes reviewable, and update its description to the final implementation. Run final multiple independent critics, fix findings, rerun checks affected by those fixes, await required PR checks and merge as authorized. The coordinating agent owns GitHub writes/push/merge in this environment.

Expected new/changed production logic is roughly 300–500 lines, excluding tests, fixtures and documentation. This is an estimate to expose overengineering, not a target or permission to omit a necessary integration path. Keep files focused and below repository line caps; do not weaken architecture or runtime guards.

## Executable validation

### Unit and composition contracts

Extend/add focused sibling specs for:

- `libs/relevance/infrastructure/reader-value/reader-value-input-builder.spec.ts`: exact formats, one shared rubric, deterministic hashes, provider cache separation, Unicode/byte boundaries, empty/blocked input, invalid interest, and existing Jev identity stability.
- `libs/relevance/application/use-cases/prepare-reader-value-summary.use-case.spec.ts`: configuration comes from the selected builder even with no inventory; mismatch rejects preparation; all manifest identity fields match the selected input.
- `libs/relevance/infrastructure/reader-value/openai-decisions-reader-value-scorer.spec.ts`: exact URL/body, shuffled valid arrays, authoritative choice/tie behavior, safe token counts, absent id/provider/cost, unknown billing, request guard failures with zero calls, wrong model, duplicate/missing/extra names and labels, malformed JSON, null/scalar responses, oversized/read-failed streams, refusal, 401/403/429/Retry-After/5xx, aborted timeout and transport failure. Assert no adapter retry and no raw diagnostics.
- `libs/relevance/application/use-cases/assess-reader-value-batch.use-case.spec.ts`: one refused item becomes permanent while the next succeeds, malformed schema pauses, and dispatch/storage retry semantics remain unchanged.
- Provider resolver specs, `apps/intelligence-worker/src/reader-value.module.spec.ts`, `libs/summary/adapters/composition/reader-summary-v3-composition.spec.ts` and daily qualification composition specs: both providers, unchanged default, missing selected key, irrelevant missing key, disabled/no-AI mode, selected preparation config, and no secret dependency in preflight.
- `scripts/quickstart/local-config.spec.ts` and focused launcher contract checks: OpenAI selection/key routing, existing Jev default, invalid combinations, selected key confined to private scoring env, and no-AI setup without credentials.
- `scripts/check-runtime-profile-guards.ts`: valid selectors, rejection of unknown selector, enabled missing-key failure at composition, durable runtime prerequisites, and no accidental provider inference.

### Deterministic PostgreSQL pipeline, required in CI

Add `scripts/check-reader-value-provider-pipeline-postgres.ts` (with focused support files if needed), registered as `check:reader-value-provider-pipeline-postgres` and invoked in the existing assessment/V3 PostgreSQL PR job in `.github/workflows/pull-request.yml`. Parameterize the same pipeline over Jev and Decisions using synthetic successful HTTP responses, the production input builder/scorer and the real Prisma inventory/store/connection. The injected transport is the only provider substitute.

Seed synthetic source capture and current interest authority in the isolated fixture. Discover/prepare it, authorize one lease, score, persist, re-read, and run real candidate qualification plus preparation/manifest reference reads. Assert selected configuration and request hashes agree at every boundary. Recreate adapters against the same database and prove a second pass reuses the same assessed row and performs no additional transport call. Prepare the same source with the other provider and prove it cannot reuse that row. Cover an actual persisted refusal and subsequent successful dispatch. Do not require fresh external credentials in CI.

Retain and run `npm run check:reader-value-assessments-postgres` for lease, RLS, immutable bytes, retention/pins, unknown accounting and lost-acknowledgement regression coverage. Run `npm run check:reader-summary-v3-postgres` because selected configuration now reaches production preflight.

### Bounded live Decisions pipeline, explicit opt-in

Add `scripts/check-reader-value-openai-decisions-live-postgres.ts` and package command `check:reader-value-openai-decisions-live-postgres`. Reuse the deterministic pipeline helpers, substituting real HTTP only. Require explicit live opt-in, the selected OpenAI key and the existing localhost-only `assessment_test_admin` database identity. Use two small synthetic sources with no private data, at most two normal paid calls, no automatic reruns, and a hard total transport-call ceiling of four including worker-owned retries. Count calls before transport; fail closed if the ceiling would be exceeded.

The live chain must include real inventory/source capture → production Decisions builder → durable ensure/claim/authorizeDispatch → real Decisions scorer → production Prisma completion → fresh-adapter exact read/reuse → actual qualification → summary preparation/pinned manifest reference read. A second pass must send zero calls. Check that live qualification matches the existing policy applied to the actual persisted answers; do not assert a subjective fixed label for a nondeterministic model. Deterministic integration separately proves the admitted-candidate branch. No summary model substitution is presented as a live final-writing test.

Report model, provider, request/hash identities, terminal/assessed state, attempts, safe request id, latency, token counts, null billed cost and the reuse-call delta. Never print credentials, raw source/prompt/response/error bodies or database connection strings. Run the authorized live check once after deterministic checks pass. If access, quota, network or database prerequisites block it, record the exact blocker and do not describe the live chain as verified; complete unaffected work and make the limitation visible before merge.

The resulting evidence proves the second scoring provider and its downstream consumption under a controlled isolated database. It does not establish comparative classification quality, production throughput, a complete historical migration chain, or a live end-to-end summary-writing benchmark.

### Repository gates and acceptance

Run the focused Jest specs, TypeScript build/typecheck, `npm run check:architecture`, `npm run check:code-quality`, `npm run check:source-line-cap`, `npm run check:runtime-profile-guards`, `npm run check:source-certification`, affected source smoke (RSS synthetic fixture for the pipeline), the assessment/provider-pipeline/V3 PostgreSQL commands and secret scanning. No dependency change is planned. No public REST/OpenAPI contract or frontend code change is planned; if implementation unexpectedly changes one, apply its additional mandated gates before claiming completion. Do not run prohibited real-project agent/runtime flows via broad `verify`.

Acceptance requires both selectable provider paths, honest null-cost persistence, terminal non-pausing refusal, preserved Jev defaults/identity, source safety and immutable request identity, correct selected config in worker/preflight/qualification, proven exact reuse and provider separation, passing required checks, bounded live evidence or an explicit unresolved blocker, two completed plan review rounds, final multi-critic review/fixes, pushed commits and an updated reviewable PR. Merge only after actionable review findings and required CI gates are resolved; do not conceal an unavailable live result as a fixture success.
