# External beta admission verification — 2026-11-24

## Delivered scope

Draft #783 contains the complete #782 history via merge commit `7db05d4f`.
#782 is closed as superseded, not merged to main. The integrated source retains
main `876ea247`, including #776/#781, and all original architecture registrations.

The follow-up separates evidence filesystem admission from CLI orchestration,
isolates durable-runtime smoke fixture ownership, rejects duplicate dry-run job
identities and requires a nonblank string operator action. No dependencies,
production runtime, public API, deployment workflow or audit exception changed.

| File | Before | After |
| --- | ---: | ---: |
| `scripts/external-beta-evidence-runner.mjs` | 917 | 464 |
| `scripts/check-external-beta-evidence-runner.mjs` | 1022 | 955 |
| `scripts/lib/external-beta-dry-run-plan-policy.test.mjs` | 997 | 877 |

The source/test cap remains 1000. Its final legacy exception has been removed.
These physical sizes are not a claim of independently credited original LOC.

## Verification

Local runtime: Node 24.22.3 on Linux. Dependencies installed from the unchanged
lockfile; Prisma Client 7.9.1 generated using a disposable CI database URL without
connecting to production. Counts below are per command and overlap; do not sum
them as distinct test cases.

| Check | Observed result |
| --- | --- |
| Consolidation baseline | 65/65 focused policy/CLI tests PASS. |
| Combined readiness, dry-run and durable-smoke tests | 86/86 PASS, zero skipped/cancelled. |
| Canonical `check:external-beta-evidence-runner` | 431/431 Node tests PASS, zero skipped/cancelled; actual bounded CLI checker then exited 0 with `External beta evidence runner contract OK`. |
| `test:e2e` | 78/78 Jest suites, 154/154 backend E2E tests PASS; 82.406 seconds. |
| `check:external-beta-readiness` | PASS, exit 0. |
| `check:external-beta-evidence-dry-run` | PASS, exit 0. |
| Architecture boundary scan and tests | Boundary scan and 56/56 boundary tests PASS. |
| Full `check:architecture` chain | NOT PASS: 142 tests completed before the existing `--experimental-default-type=module` flag was rejected by local Node 24. Native workflow selects Node 22; local Node 22 installation was unavailable after the network approval request was cancelled. No flag or gate was weakened. |
| Supplemental remaining architecture commands on Node 24 | 185 test executions PASS, zero skipped/cancelled. The 12 affected commands omit only the unsupported invocation flag; the other 10 commands are unchanged. The existing chain repeats 18 cases. The actual synthetic Docker staging bundle validator also passed without launching Docker. This does not replace the canonical Node 22 gate. |
| `check:code-quality` | Exit 0; lifecycle runner test PASS. Python checks: 33 executed successfully, four PostgreSQL18 cases skipped because no explicit isolated database URL was supplied. Skips are not PASS. |
| `check:source-line-cap` | PASS; 5823 source/test files scanned, cap 1000, no legacy exception. |
| `git diff --check` | PASS. |
| Raw `npm audit --json` | Exit 1: 24 affected entries (5 high, 18 moderate, 1 low, 0 critical). The lockfile and exception policy are identical to main; this remains accepted baseline debt, not a clean raw audit. |
| Canonical `check:dependencies` | PASS, exit 0, under the unchanged existing exceptions expiring 2026-12-04. No exception was added, widened or extended. |
| Canonical local `lint` | NOT PASS: V8 heap exhaustion near the configured 3072 MiB limit, before its 240-second timeout. Native CI must qualify the full command. |
| ESLint on all 32 changed `.mjs` files | PASS with unchanged configuration after the one-line `globalThis.structuredClone` fixture correction. The 15 path-admission tests also passed again with zero skipped/cancelled. |

Four new real sandbox CLI scenarios prove admission-before-side-effect: reject a
workspace-target output symlink without invoking the synthetic producer or
overwriting its target; reject a dangling symlink without creating its target;
reject a workspace-target env-file alias without exposing its contents; accept
a genuine future output through a safe parent alias after `--env-file` loading.
Additional cases cover canonical fixture parents, extensions, private modes,
unreadable realpaths and workspace children named `..cache`.

## Review and corrections

Three agents reviewed architecture, existing GitHub comments and behavioral risk
before implementation, then cross-reviewed each other's changes. All 31 original
dry-run top-level tests remain in order; only their reusable CLI fixture moved.
All four durable smoke function bodies preserve their original behavior apart
from explicit clock injection. Existing runner functions were accounted for;
intentional differences are the documented path-admission corrections.

The first combined runner run exposed an obsolete source-location assumption in
the durable negative-scenario gate. The correction reads the actual new owner,
retains the original VM sentinel and deleted/commented/unreachable/nested negative
cases, and adds AST proof of the real import, binding, injected scenario factory
and caller invocation. Independent review and 22/22 gate tests passed; the full
431-test runner command subsequently passed. Safety markers were relocated to
their implementation owner with negative mutation coverage, not removed.

At intake all existing inline threads were already resolved (7 on #783, 11 on
#782). New implementation and the integration correction received independent
agent review with no remaining confirmed findings. Historical incomplete bot
reviews are not counted as approval.

The subsequent whole-repository lint attempt exhausted its local heap. Focused
lint then found one new fixture reference missing the explicit `globalThis`
qualifier. That one-line correction passed lint for all changed modules and the
15 path-admission regressions; no lint configuration or memory limit was changed.

## Remaining qualification limits

Draft is intentionally retained. This work neither merges to main nor deploys.
Final GitHub jobs must be reported from their actual source revision; queued,
skipped, cancelled or earlier-revision jobs do not qualify the final revision.
This document records local evidence before the final GitHub qualification run.
The existing `workflow_dispatch` entrypoint runs full qualification on this PR's
branch while retaining Draft status, without changing workflow gates. The PR
description records the final tested head, run links and actual terminal results.
The four optional, unchanged PostgreSQL18 Telegram grant cases require their own
fresh disposable cluster and explicit test URL; the current full workflow does
not provision that fixture, so its success cannot be claimed as their execution.

The deterministic tests do not establish live external-beta readiness. The
existing race between path admission and a separately executed producer's later
write is not removed; no filesystem locking or atomic producer rewrite is claimed.
Runtime/TypeScript qualification remains separately owned by #793, and model
adapter work by #665.
