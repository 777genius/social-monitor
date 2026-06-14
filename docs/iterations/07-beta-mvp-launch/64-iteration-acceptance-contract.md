# Iteration 07 - Iteration Acceptance Contract

## Provider
Beta launch team provides validated MVP learning, support findings and post-MVP roadmap inputs.

## Receiver
Post-MVP roadmap owners receive prioritized backlog, ADR updates and quality-gate updates.

## Handoff Promises
- Beta scope and supported sources are documented.
- Onboarding results are recorded and backend core loop, source binding pause/resume and feedback submission pass `npm run check:mvp-core-loop`.
- Feedback is classified with evidence.
- Unsupported source requests are policy-safe backlog items and `npm run check:beta-scope-policy` passes.
- Ring expansion decisions are gated by `npm run check:beta-ring-policy`.
- Post-MVP work preserves architecture guardrails.

## Receiver Expectations
- Roadmap can rank work by demand, risk and cost.
- Source expansion can use capability/profile rules.
- Trust/relevance work can feed eval and quality gates.

## Blocking Defects
- Real beta feedback report has no owner or evidence.
- Unsupported source bypasses policy.
- Backend beta scope policy gate fails.
- Backend beta ring policy gate fails.
- Backend core-loop release gate fails.
- Core onboarding cannot be completed.
- Launch cannot be paused safely or paused source bindings can still enqueue new scan work.

## Allowed Exceptions
- Broad source catalog remains post-MVP.
- Enterprise reporting remains post-MVP.
