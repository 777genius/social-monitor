# Reader Summary Mega-Test Regression Migration

## Scope

The deleted `libs/summary/domain/aggregates/reader-summary.spec.ts` was a
1,295-line aggregate mega-test. It was over the human-written 1,000-line cap
and mixed ranking, editorial projection, provider metrics, canonical dedupe,
source mix, and card-cap behavior. The line-cap exception was therefore
removed rather than extended.

This audit treats the old assertions as regression intent, not as permission
to preserve the obsolete pre-Promotion-V1 selection path.

## Migration register

| Deleted regression intent | Current focused executable home | Disposition |
| --- | --- | --- |
| A single source title must not become an over-confirmed headline | `reader-summary-narrative-lead.spec.ts` and `reader-summary-promotion-production-path.spec.ts` | Replaced by admitted-evidence narrative projection and confidence tests. |
| Representative preview media reaches a visible card | `reader-summary-promotion-production-path.spec.ts` | Preserved through the promoted lead projection; rejected/support/context media cannot leak. |
| Ineligible cluster evidence stays out of Top reads | `reader-summary-promotion-production-path.spec.ts` and `reader-post-promotion-policy.spec.ts` | Strengthened: quality, safety, citation, freshness, metric, and relation failures are fail-closed before synthesis. |
| Social takeaways stay content-first and calibrated | `reader-summary-narrative-lead.spec.ts` | Replaced by the admitted narrative/takeaway projection. |
| Top reads follow deterministic rank rather than authored model order | `reader-post-promotion-selection.spec.ts` and `reader-summary-narrative-lead.spec.ts` | Strengthened with immutable lane ranking and authored-order non-interference. |
| Repository-radar summaries remain source-aware | `reader-summary-github-trending.spec.ts`, `story-ranking-golden-eval.spec.ts`, and `reader-summary-no-signal-github-board.spec.ts` | Split by repository-growth ranking, supplemental Trending behavior, and no-signal board behavior. |
| At most eight Top cards are visible | `reader-summary-promotion-production-path.spec.ts` | Preserved with independent eight-card Top and Additional caps. |
| Weak evidence never refills a short lane | `reader-summary-narrative-lead.spec.ts` and `reader-summary-promotion-production-path.spec.ts` | Strengthened: no refill from rejects, model stories, or cluster order. |
| Repeated model stories are deduplicated before caps | `reader-post-promotion-selection.spec.ts` | Replaced by canonical candidate representatives before lane caps. |
| Canonically equivalent repository/source URLs deduplicate | `reader-post-promotion-selection.spec.ts` and `reader-summary-promotion-production-path.spec.ts` | Preserved at the canonical identity boundary and rechecked at publication. |
| Interest sections do not clone Top cards | `reader-summary-narrative-lead.spec.ts` | Preserved by citation-only admitted interest projection. |
| Multiple providers on an approved same story produce cross-source support | `reader-summary-promotion-production-path.spec.ts` and `reader-post-promotion-selection.spec.ts` | Strengthened with approved relation confidence, valid-lead selection, support-window checks, provider mix, and confidence caps. |

## Completion evidence

The migration is complete only while the focused specs above, the publication
policy spec, the execute-job pre-model admission spec, and
`npm run check:source-line-cap` are green. Restoring the deleted mega-test or a
new root catch-all test is not an acceptable rollback.
