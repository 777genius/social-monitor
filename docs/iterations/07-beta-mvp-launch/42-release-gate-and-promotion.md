# Iteration 07 - Release Gate And Promotion

## Promotion Goal
Approve movement from MVP beta into post-MVP roadmap execution.

## Required Evidence
- Beta scope freeze is respected.
- Supported source list is unchanged or change-controlled.
- Backend MVP core loop, digest delivery and feedback submission pass `npm run check:mvp-core-loop`.
- Unsupported/deferred sources pass `npm run check:beta-scope-policy`.
- Hacker News and RSS worker ingestion smokes pass `npm run check:hn-smoke` and `npm run check:rss-smoke`.
- Ring expansion policy passes `npm run check:beta-ring-policy`.
- Persistence readiness passes `npm run check:persistence-readiness`; external beta is blocked until durable adapter exit criteria are met.
- Monitoring Prisma persistence smoke for topics, source bindings, scan policies and scan jobs passes `npm run check:monitoring-persistence`.
- Launch pause for source bindings is covered by `npm run check:mvp-core-loop`.
- Launch and rollback checklist is executed.
- Support triage captures known limitations and incidents.
- Feedback is classified by demand, reliability, trust, UX, source risk and cost.

## Promotion Checks
- Beta validated the user-facing core loop and the backend core-loop/digest-delivery/feedback gate is green.
- Unsupported source requests did not bypass policy and are captured as source-owner backlog evidence.
- Enabled real-source paths have deterministic worker smoke evidence, not only provider fixture certification.
- Ring expansion cites capacity, cost, source-health and degradation evidence.
- Persistence readiness cites every runtime in-memory/noop state adapter with owner, risk and durable replacement plan.
- Roadmap items cite evidence.
- Residual risks have owners.

## Hold Conditions
- Launch cannot be paused safely or `npm run check:mvp-core-loop` no longer proves paused source bindings reject new scan work.
- Feedback is anecdotal and unclassified.
- Source expansion is requested without risk/cost review.
- Users cannot complete onboarding reliably.
- Runtime persistence is still in-memory/noop-backed for any external beta or multi-process claim.

## Rollback Or Rework
- Pause beta if reliability or trust drops below gate.
- Rework onboarding if users cannot reach first summary.
- Rework roadmap if source demand conflicts with risk policy.

## Approval
Post-MVP work may start only when beta evidence is translated into reviewed backlog, ADRs and updated quality gates.
