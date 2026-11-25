# Iteration 02 - Implementation Readiness Scorecard

| Area | Ready When | Status |
| --- | --- | --- |
| SDK | Provider port and capability model are clear | To review |
| Sources | HN/RSS scope is fixed | To review |
| Jobs | Scheduler, lease, retry and cursor rules are defined | To review |
| Feed | Normalized schema and dedupe strategy are ready | To review |
| Testing | Certification and repeated-scan tests are planned | To review |
| Ops | Failure taxonomy and dead-letter context are ready | To review |

## Go/No-Go Rule

Start adapters only after SDK/certification contract is green.

## Status Legend

- `Green` - documented, reviewed and backed by evidence.
- `Yellow` - owner, mitigation and deadline are written.
- `Red` - dependent work is blocked.
- `To review` - default state; not approval.

## Evidence Required

Attach the evidence in `59-traceable-evidence-register.md` before marking any row `Green`.
