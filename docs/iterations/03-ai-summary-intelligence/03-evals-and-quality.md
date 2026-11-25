# Iteration 03 / Phase 03 - Evals And Quality

## Objective

Create summary evaluation harness before tuning prompts.

## Steps

1. Build golden fixture dataset for HN/RSS.
2. Add adversarial prompt-injection examples.
3. Add schema conformance eval.
4. Add citation correctness eval.
5. Add relevance/usefulness scoring.
6. Add cost/latency regression tracking.
7. Add release gate thresholds.
8. Add no-signal/empty-window eval cases.
9. Add stale-summary and conflicting-evidence eval cases.
10. Add feedback taxonomy: wrong fact, missing source, poor relevance, too verbose, too terse, wrong language, unsafe/unsupported request.

## Release Gate Thresholds

Prompt/model/schema changes are blocked unless:

- Schema conformance is 100% on blocking fixtures.
- Citation coverage for key claims is 100% on blocking fixtures.
- Known prompt-injection fixtures do not alter instructions.
- No-signal fixtures produce no-signal output instead of fabricated insight.
- Cost and latency stay within accepted budget or have explicit owner-approved exception.
- Any regression in factuality/citation correctness is treated as blocking.

## Eval Dataset Structure

Each fixture includes:

- fixture id and version
- input feed/source items
- tenant/topic/source metadata
- summary policy/rules
- expected schema behavior
- expected citation behavior
- expected quality flags
- expected failure/no-signal behavior when applicable
- cost/latency budget expectation
- feedback labels if derived from user feedback

Minimum fixture groups:

1. empty/no-signal
2. noisy irrelevant items
3. conflicting evidence
4. duplicate cross-source evidence
5. multilingual output
6. long context/window truncation
7. source limitation/unavailable evidence
8. prompt-injection/adversarial source text
9. malformed provider response
10. uncited or wrong citation output
11. cost regression
12. feedback-derived regression

## Blocking Vs Informational Metrics

Blocking:

- schema conformance
- citation coverage and citation validity
- prompt-injection instruction integrity
- no-signal correctness
- tenant/topic evidence boundary
- source-policy AI permission
- cost budget breach without approved exception

Informational during MVP:

- style preference score
- perceived usefulness score
- latency percentile beyond hard timeout
- source diversity score when source data is limited
- model-graded helpfulness

Do not let style/helpfulness scores override citation/factuality blockers.

## Edge Cases

- Model output passes schema but makes unsupported claim.
- Summary ignores user rules.
- Prompt-injection text becomes instruction.
- Evaluation data leaks real sensitive content.
- Eval improves style score while reducing citation correctness.
- Human feedback conflicts with automated eval score.
- Golden dataset becomes stale after source normalization changes.
- Feedback-derived fixture contains private/sensitive user text.
- Eval data accidentally includes raw provider credential or prompt.
- New model passes evals but changes summary language style enough to confuse UX snapshots.

## Pay Attention

- Model-graded evals need calibration.
- Human review labels should feed dataset.
- Eval dataset must be versioned.
- Keep eval fixtures sanitized and tenant-safe.
- Add a fixture when a production feedback issue would have caught a bug.

## Acceptance Criteria

- Prompt/model change runs evals.
- Unsafe output is caught.
- Cost regression is visible.
- Release gate blocks bad prompt.
- Feedback can be converted into eval fixtures.
- Eval report records prompt/schema/model/dataset versions.
- Blocking and informational metrics are separated in reports.
