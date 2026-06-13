# Iteration 07 - Final Go/No-Go Checklist

## Decision Scope
Decide whether beta can close and post-MVP roadmap execution can start.

## Go Conditions
- Backend MVP core loop and feedback submission pass `npm run check:mvp-core-loop`.
- Unsupported/deferred source policy passes `npm run check:beta-scope-policy`.
- Beta user can complete onboarding against the same topic/source/scan/feed/summary/feedback/realtime path.
- Supported source list is frozen or change-controlled.
- Known limitations are explicit.
- Rollback/pause path has owners.
- Feedback is classified with evidence.
- Post-MVP backlog preserves architecture guardrails.
- Common source/scan/feed/summary failures are diagnosable by support.
- Post-MVP backlog separates blockers, accepted MVP gaps and evidence-based opportunities.
- Launch evidence bundle is complete and linkable.
- Internal dogfood and private beta ring criteria are satisfied.
- Known limitations are visible to users and support.
- Cost/usage telemetry is visible per tenant/topic/source.
- Capacity envelope and degradation policy are proven before ring expansion.

## Hold Conditions
- More beta data is needed for a non-critical roadmap area.
- Some enterprise feature requests remain unranked.
- Support load or source cost needs more observation but no blocker is open.
- Source expansion demand exists but access/cost decision is not ready.

## Rework Conditions
- Unsupported source entered launch scope.
- `npm run check:beta-scope-policy` fails or is removed from release evidence.
- Launch cannot be paused safely.
- Real beta feedback report has no owner/category/evidence.
- Users cannot complete core onboarding.
- `npm run check:mvp-core-loop` fails or is removed from release evidence.
- Cross-tenant, secret leakage, uncited summary or idempotency/cursor data-loss risk remains open.
- Known limitation hides a failure that users will hit in the core loop.
- Launch evidence bundle is incomplete for security, source certification, summary eval or restore.
- Support requires developer shell/database access for common beta failures.
- Beta ring expansion is requested while blockers are open.
- Capacity/cost/source-health evidence is missing for launch or ring expansion.

## Accepted Exceptions
- Broad source catalog remains post-MVP.
- Enterprise reporting remains post-MVP.
- Physical microservice split remains post-MVP unless runtime evidence requires it.
- Advanced analytics and integration marketplace remain post-MVP.
- Larger eval dataset can grow after beta as long as blocking eval gates pass.

## Critical Audit Evidence
- Critical MVP Gap Audit is green for all beta-critical rows.
- Launch evidence bundle includes source, summary, security, API/generated-client, support and cost proof.
- Any accepted exception has owner, user-visible limitation, mitigation and revisit date.
- Capacity envelope and degradation evidence are attached to launch/ring decisions.

## Post-MVP Backlog Classification

Classify every carryover item as:

- `Blocker`: must be fixed before beta continues.
- `Accepted MVP gap`: safe to carry with known limitation and owner.
- `Evidence-based opportunity`: beta demand exists and architecture path is safe.
- `Deferred idea`: useful but no beta evidence or safe access path yet.

## Decision Record
Record decision as `go`, `hold` or `rework` with onboarding, launch, feedback and roadmap evidence.

Required evidence links:

1. fresh tenant E2E result or `npm run check:mvp-core-loop` result for backend MVP loop
2. supported source certification and beta scope source policy
3. summary eval/citation gate
4. tenant isolation/redaction checks
5. cost/usage dashboard
6. support triage drill
7. known limitations page
8. rollback/pause-source drill
9. feedback classification report
10. post-MVP backlog classification
11. capacity envelope and degradation drill
