# GitHub Issues runtime smoke SRP extraction — 2026-11-11

## Pinned scope and baseline

Source baseline: `main afabb9d5c4d10cbe512e3b5accf874910d86d1c8`, original `scripts/check-source-provider-runtime-contract.ts` blob `8beaef82be4395117e3415e66ce45023e0390c2e` (1195 physical LOC).

Relocate one cohesive runtime contract scenario, `verifyGitHubIssuesRuntimeModes`, to `scripts/lib/source-provider-github-issues-runtime-smoke.ts`. Original declaration spans 141 physical lines, of which **136 are nonblank**, including declaration and braces; conservatively count **134 unique original nonblank body LOC** (not net deletion, not padding). The original function body, from its first opening brace onward, is unchanged byte-for-byte; only the exported signature and injected dependencies are new. Existing repo radar smoke is already modular and remains untouched. Existing Source Provider checker remains the sole executable/orchestration owner.

Files: one original checker, one new helper, one new structural regression gate, `package.json`, `scripts/check-source-line-cap.mjs`, this plan. No production providers, schema, credentials, deploy, SSH, feature flags or large framework.

## Contract and architecture

- Preserve original sequential runtime checks: validation → Reddit → GitHub Issues → GitHub Repo Radar → GitHub Trending → RSS → Hacker News.
- Inject only existing `withMockedFetch`, `assertFailure` and `assert` callbacks, following the already-existing GitHub Repo Radar smoke seam. HTTP client/provider constructors remain in the scenario-owning helper. No early IO or alternate stores.
- Retain anonymous/token request differences, GitHub REST host/search/sort/order/version/headers, cursor handling, bounded synthetic response, error redaction, and provider failure classification. The original helper body remains text-identical.
- Source physical line cap ratchets strictly **1195 → 1049**, with no other caps increased. Wire focused positive and adversarial structural regressions into the original `check:source-provider-runtime-contract` alongside its existing repo radar gate and real runtime checker.

## Three independent critique passes

1. **Behavior and side effects:** Header/version/auth and network mock behavior must stay in the same order. Moving the scenario must not move mock setup to import time, change `globalThis.fetch` restoration, leak synthetic token, or add real network access. Exact original-body comparison plus original runtime smoke is required.
2. **Architecture and security:** Keep one module owner and one top-level caller inside the awaited main sequence. No unused dependency resolution and no duplicate copy of the old implementation. AST tests reject removed/commented/dormant/duplicated calls, wrong dependencies, and reordered checks. Existing security/line-cap checks must remain fully enforced.
3. **Concurrency and evidence:** Existing unrelated PRs #665 (separate model adapter), #728 (staging capture), and #734 (external-beta display) are independently owned. They do not modify this source file, but #728/#734 share `package.json` and `check-source-line-cap.mjs`. Reconcile their accepted changes without overwrites or force push, then re-qualify the exact final head after any main advance.

## Gate for acceptance

- Draft original CI + nonpublishing API image: inspect actual logs and fix genuine failures in this PR.
- Independent structural review, respond to valid findings, then Ready **20/20** exact-final-HEAD workflow.
- Recheck ownership markers, current base and mergeability; perform expected-head-SHA guarded squash merge only when authorized and all original gates green.
- Verify naturally triggered postmerge native `main` **20/20**. Count the conservative 134 original nonblank body LOC once only after postmerge.
