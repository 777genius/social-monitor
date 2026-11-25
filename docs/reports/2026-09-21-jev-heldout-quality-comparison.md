# Jev primary scorer - fixed five-day comparison

Date: 2026-09-21. Implementation base: `0e9704324a673d83d938ae970c4b2b14fc8bb637`.

## Decision

The fixed reviewer-only comparison passed its narrow quality rule: the Jev selector produced more independently model-judged useful unique stories in Top-8 slots and did not increase judged noise. It found 37 useful unique stories across 40 slots versus 7 across 40 slots for the persisted legacy publications; judged noise was 0/40 versus 3/16.

This is strong evidence that broader semantic admission is better than the current popularity-heavy path on these five days. It is not evidence that production should switch now. The comparison used a later read-only snapshot, persisted V2 publications rather than a fresh same-snapshot V2 replay, R2.1 rather than the implementation's exact `reader-value.v1` rubric, and it did not run V3 presentation/headline/final-summary stages. Labels are blind model judgments, not human ground truth. Therefore the implementation remains code-ready with `legacy_v2` as default; product-ready and production-enabled remain false.

## Fixed protocol

- Five consecutive, previously unused UTC windows: 2026-09-13 through 2026-09-17.
- All 3,888 visible scoped candidates were exported read-only and scored; no popularity or previous rank was sent to Jev.
- Export cutoff: 2026-09-21T19:42:09.586Z. This is explicitly a snapshot of old posts, not historical replay.
- V3 reviewer selection used `usefulness DESC, relevance DESC, publishedAt DESC, candidateId bytewise ASC`, story/source dedup, provider cap 4 for four active provider families, and Top limit 8.
- Blind packet: union of actual V2 Top, V3 reviewer Top, and 100 deterministically stratified excluded candidates. It contained 156 shuffled candidates. Origin, Jev labels, popularity, and order were hidden.
- One independent hosted judge (`gpt-6-astra`, medium) labeled two disjoint packet halves with useful/borderline/noise/insufficient-data and important/not-important. This is `model_judged`, not ground truth.

Private source texts, requests, Jev responses, selection identities, and labels remain outside Git. The tracked aggregate is `scripts/evals/reader-value-primary-scorer/heldout-safe-results.json`.

## Result

| UTC day | Inventory | V2 selected | V2 useful stories | V2 noise | V3 reviewer selected | V3 useful stories | V3 noise |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-13 | 690 | 2 | 0 | 0 | 8 | 7 | 0 |
| 2026-09-14 | 765 | 2 | 1 | 0 | 8 | 7 | 0 |
| 2026-09-15 | 784 | 8 | 2 | 3 | 8 | 7 | 0 |
| 2026-09-16 | 904 | 4 | 4 | 0 | 8 | 8 | 0 |
| 2026-09-17 | 745 | 0 | 0 | 0 | 8 | 8 | 0 |
| **Total / 40 slots** | **3,888** | **16** | **7** | **3** | **40** | **37** | **0** |

The large absolute gain is not merely "Jev selected more": among the extra selected items the blind judge still marked 30 additional unique stories useful. However, V2 had 24 empty slots and was not freshly replayed against the same later snapshot, so the comparison combines selection quality with legacy underfill. No universal precision or recall claim is made.

## API measurements

All 3,888 calls succeeded. Requested model was `typesafe/jev-1.13`; resolved model was `typesafe/jev-1.13-20260917`, provider `TypeSafe`.

| Measurement | Result |
| --- | ---: |
| Input tokens | 5,445,308 |
| Actual Jev cost | $0.228703 |
| Per 1,000 candidates | $0.058823 |
| Latency p50 / p95 / mean | 356 / 503 / 377 ms |
| API/schema errors | 0 |

These are scorer-only measurements. Cache retrieval, presentation generation, final summary generation, and their cost/latency were not measured in this run. Warm concurrency-4 resume throughput was about 633 posts/minute, but the interrupted control portion prevents claiming a single clean full-batch wall time.

## Representative judgments

Good Jev recoveries included concrete agent QA methods, local-agent queue constraints, a Python agent framework with explicit limitations, an agent control plane with budget/approval mechanisms, and a chart language designed for versioned agent workflows.

The blind judge also exposed three V3 borderline selections: a subjective model comparison without tasks/evidence, a token-usage complaint with unmeasured advice, and a discussion asking when AI-built MVPs need engineering review. These are useful tuning examples, not a reason to add a second mandatory reviewer or regex layer.

Legacy examples included three selected noise items on September 15: generic project-structure advice without method, speculation about model-praise shills, and a casual ChatGPT-adoption anecdote. Three other legacy selections were insufficient-data link/title claims. Conversely, legacy correctly retained concrete JVM inference, reverse-engineering, local coding-agent architecture, and workflow examples.

## Rollout and rollback boundary

1. Ship additive storage/readers and keep `legacy_v2` as the default.
2. The next safe operational step is bounded `jev_shadow` for the chosen scope, with no public double-send.
3. Before `jev_primary_v3`, repeat the fixed comparison with exact `reader-value.v1`, the same frozen inputs for both V2/V3, and actual presentation/display-ready output. Require strictly more useful unique stories, non-increased noise, and no known-important technical loss.
4. Primary activation still requires a separate owner release decision.
5. Ordinary rollback sets new jobs to `legacy_v2`; frozen V3 jobs drain under pinned configuration. Fatal provider pause stops HTTP. Emergency cancellation uses the scoped operator command and cannot revive published/cancelled jobs. Migrations/readers remain for already-created artifacts.

## Reproduction

Offline aggregate generation:

```sh
node scripts/evals/reader-value-primary-scorer/analyze-heldout.mjs \
  PRIVATE_CORPUS PRIVATE_JEV_JSONL PRIVATE_BLIND_PACKET SAFE_SCORER_JSON PRIVATE_SELECTION

node scripts/evals/reader-value-primary-scorer/evaluate-heldout-labels.mjs \
  PRIVATE_SELECTION SAFE_SCORER_JSON PRIVATE_LABELS_A PRIVATE_LABELS_B SAFE_QUALITY_JSON
```

Tracked identities:

- Corpus: `01161f0dc37507035769b40f8e9e25e164a7bb8866162dc8d82fa16164f3c06f`
- Scorer corpus: `42274c539fab88aa4834a101164ac994d659ac4a0acd4173516d08cca8fe170e`
- Blind packet: `22cf1beea04d9a7a62e404748fcdcb19b25f5db7c5dfcccfe53310879ab29862`
- Jev config: `173e7ae816ebd2902d1cf6b8ee8f4f71a52f14783df14f88c9c5aa1ce61be2fc`

No production ranking, configuration, schema, data, publication, or deployment was changed by the comparison.
