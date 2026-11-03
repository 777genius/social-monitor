# Daily top-30: editorial plan → article

Status: implementation plan. Base: PR #613 (daily native-Likes top-30), not current `main`.

## Objective
On the **new** daily top-30 profile, after the existing immutable selection of up to 30 accessible ordinary posts, run a single editorial model task that reads every selected post and returns 1–10 ordered, distinct topics. The first is the lead; others may be detailed or brief. Usually 3–5 deserve detail; do not force a quota. The writer then covers **exactly** those topics in order. Popularity is supporting context, not the deciding criterion. Keep GitHub Trending separate.

## Explicit boundaries
- Do not modify selection, deduplication, saved native metrics, source collection, browse sorting, promotion board/AI picks, `Used`, sourceMix, public DTOs, weekly, historical recovery or other model profiles.
- No new tables, Prisma migration, model coordinator, additional ranking engine or feature flags.
- Preserve PR #613's unsupported outcome for nonempty daily inputs without a sealed promotion board; fixing that is a separate issue.
- An empty input keeps the current no-signal behavior. An invalid editorial plan or writer output fails closed; never publish a partial article or silently fall back to the first six.
- Deploy TEST preview only until evaluated; production and other days are separate decisions.

## Schema and model routing
A private, versioned plan: `{ version: "reader_summary.daily_editorial.v1", topics: [{ title, why, depth: "detailed"|"brief", feedItemIds: string[] }] }`. No model-assigned topic IDs or numeric scores.

Validate 1–10 topics for nonempty input, nonempty strings and IDs, membership in the immutable selected input, no duplicate feed ID within/across topics and unique anchor story IDs. First topic is the lead. Unused posts are allowed. A topic's anchor is the cluster of its first assigned source, **but other assigned IDs remain attached**. Code can validate IDs, not semantic equivalence: test semantic deduplication with crafted examples.

Use the same bounded source text as the writer, plus stable feed ID, provider, publishedAt, saved `nativeCount` (X Likes, Reddit score, etc.) and `engagementObservedAt`. Unknown is null; never compare incomparable metrics as if they were one like count. Editor prompt ranks significance, novelty, practical utility, evidence strength and monitored-topic relevance; a popular unsupported rumor may only appear briefly with explicit attribution.

Send the editor through the **existing AgentRuntime / Responses configured route**, timeout, attestation, task journal, error taxonomy and cost accounting. Use a distinct purpose/task role and compact strict response schema. Budget editor + writer + any existing repair attempts within the current task allowance, including already consumed attempts. No writer call after failed validation or exhausted budget.

## Writer: exact and source-bound
- Build a daily-only coverage projection from the validated plan, instead of the first six inputs. Leave the legacy `buildReaderSummaryCoveragePlan` behavior untouched outside this profile.
- Writer retains all 30 selected evidence items as context. It emits exactly one ordinary narrative section and one corresponding topic summary per planned topic, in plan order: lead, then secondary signals. `depth` changes prose length, not the public data model.
- Citation allowlists are **per topic feedItemIds**, not globally selected evidence. For multi-cluster topics retain the first cluster as anchor but accept citations from other **assigned** sources. Do not weaken generic cross-cluster safety for other profiles.
- Fail instead of silently normalizing away topics, filling from unrelated clusters, inserting unplanned watches or reordering. Adapt daily-only JSON schema, maximum 10 topStories/sections, narrative normalization, coverage and editorial-quality gates, full rendered text size and the Flutter secondary `.take(5)` limit.
- GitHub appendix continues on its separate existing path. `Used` and provider sourceMix count all actual writer evidence, including uncited context.

## Durable proof and transaction
Add one optional `dailyEditorialPlan` field to the **existing private artifact JSON**. Carry its version, validated topics, frozen selected-input binding/hash, editor request/output attestation or receipt binding, and writer-plan projection hash. Preserve `dailyGenerationInput.sent` and its evidence/payload hashes.

For the new prompt/profile only, require the field and reject invalid/missing/foreign-profile plans. In `dailyGenerationPublicationMatches`, reconstruct the immutable 30-item evidence from the frozen manifest/assessment snapshots, validate IDs/uniqueness/plan hash, verify the editor receipt and actual sent writer plan projection and enforce topic/section/source attribution. Existing publication guard presently checks evidence hashes but **not** the complete writer `sent.payloadSha256`: do not claim that evidence hashes alone verify the entire request. Reuse existing serialization/read-back and atomic publication transaction. Existing artifacts without the new field keep the old path.

## Required E2E/quality tests
1. A fixture of 30 accessible inputs where the important event appears after item 6 and becomes lead; distinct-source same-event phrasing merges; a highly popular weak rumor remains brief and attributed.
2. 1 topic, 10 topics; 11 rejected; unknown, repeated and cross-topic feed IDs rejected; full 30 evidence remains counted for `Used`.
3. Wrong citation/cluster assignment, missing/reordered topic, added unexpected topic, missing/invalid proof, changed frozen input/plan/receipt rejected before publication.
4. Old daily/weekly artifact and proof roundtrips; no-signal unchanged; unsuccessful second call preserves old publication, counts attempted usage and respects task retries.
5. Flutter renders all 10 topics in exact order and GitHub Trending separately.

Run the affected adapters, use-case, guard and PostgreSQL publication tests; follow `CLAUDE.md` (architecture, code quality, source line cap, runtime guards when applicable). For Dart changes run `fvm flutter analyze`, `fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart`, and affected UI tests.

On TEST only, repeat 2026-11-01 UTC via the normal task and gateway using the **same frozen snapshot**, inspect actual editor/writer calls (repairs counted separately), source IDs, proof, citations and published GET/List artifact. Verify all topics, Used and GitHub appendix through Marionette; compare old/new prose on the same evidence. Update TEST preview after green checks. Hold production.

## Definition of done
All 30 supplied to editor and writer; up to 10 distinct source-grounded article topics in editorial order; source binding, task receipts and transaction guard verified; no silent truncation; old paths pass; two critical code-review rounds resolved; CI and TEST E2E green; only then merge.

Estimate: roughly 450–750 LOC implementation, 350–650 LOC focused tests. One additional logical model task on successful daily generation (possible transport repair is tracked independently).
