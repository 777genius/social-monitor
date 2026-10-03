# Runner capacity decision — 2026-10-03

Keep standard GitHub-hosted runners. Recent main runs take 15m32s and
11m33s, meeting the 20–30 minute CI target. Do not deploy a new runner
platform or change concurrency in this patch.

The October 1 audit observed roughly 210 minutes wall time, a longest job
of 12 minutes and queues of 48–118 minutes. Its cause remains unconfirmed;
account-wide peak demand and the root cause are unknown.

## Measured evidence

Times below come from supplied public run/job timing evidence. Active runner
minutes sum job execution durations; they are distinct from wall time and queues.

| Run / head | Wall seconds | Active runner minutes | Unit shards (seconds) | Maximum queue seconds |
| --- | ---: | ---: | --- | ---: |
| [Baseline 37040676496](https://github.com/777genius/social-monitor/actions/runs/37040676496), `1360f…` | 1186 | 58.8167 | 304 / 334 / 562 / 599 | Not supplied here; queues present |
| [Post-balance PR 37052960203](https://github.com/777genius/social-monitor/actions/runs/37052960203), `64d3…` | 640 | 68.1833 | 474 / 555 / 557 / 616 | 32 |
| [Post-merge main 37054635655](https://github.com/777genius/social-monitor/actions/runs/37054635655), `a349…` | 932 | 69.75 | 467 / 532 / 616 / 621 | 318 |
| [Latest main 37097311576](https://github.com/777genius/social-monitor/actions/runs/37097311576), `3854c9d491d156e6fb2ade0492ad2f5bf0ea1eb7` | 693 | 66.1 | 478 / 441 / 675 / 649 | 27 |

Latest main passed all 16 jobs. These runs have different heads and runner
conditions: wall time improved, but active compute increased versus the baseline.
They do not establish causation or a 40% compute reduction. The older duplicate
PR-plus-coverage figure of 97 runner-minutes is a separate old-head comparison.

## Capacity and escalation

The actual GitHub API user plan was null, so the account's concurrency limit
cannot be inferred. [Official limits](https://docs.github.com/en/actions/reference/limits)
list 20 concurrent standard jobs for Free and 40 for Pro; the actual plan is unknown.

Escalate if observed peak periods repeatedly exceed the 20–30 minute target
because of long queues, with account-wide concurrent-job and capacity evidence.
Collect that evidence at the affected peak; no arbitrary ten-run waiting period.
Distinguish runner availability from DAG waits before choosing more capacity.
If a new platform becomes warranted, evaluate
[ephemeral autoscaling](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
and isolate untrusted fork code: GitHub
[warns that public forks can execute unsafe code on self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).
No runner provisioning, production credentials, or CD activation is authorized by this decision.
