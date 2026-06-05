# Iteration 07 / Phase 03 - Launch Readiness

## Objective

Run final release gates before beta launch.

## Steps

1. Run full CI.
2. Run E2E workflow from topic to summary.
3. Run restore drill.
4. Run provider outage drill.
5. Run auth/tenant negative tests.
6. Verify API/operator beta harness.
7. Verify frontend deferral notes and privacy/support limitations.

## Launch Evidence Bundle

Collect before invite:

1. CI run id and status.
2. Backend artifact/image digest.
3. API harness or generated client version.
4. OpenAPI/event/schema versions.
5. Migration clean/upgrade test evidence.
6. Tenant isolation/redaction test evidence.
7. Connector certification evidence for enabled sources.
8. Summary eval/citation/cost gate evidence.
9. E2E fresh-tenant smoke evidence.
10. Provider outage, AI outage, quota and restore drill notes.
11. Known limitations link.
12. Support/runbook links.
13. Rollback/pause owners.
14. Capacity envelope and degradation drill evidence.
15. Ring expansion thresholds and hold/rework criteria.

## Launch Rings Checklist

Before each expansion:

1. Review incidents and support issues from current ring.
2. Review source health and scan freshness.
3. Review summary quality and citation feedback.
4. Review cost/usage by tenant/topic/source.
5. Confirm no beta blockers are open.
6. Confirm known limitations still match actual behavior.
7. Decide go/hold/rework for next ring.
8. Confirm capacity envelope remains green or accepted yellow with owner.

## Edge Cases

- Staging works but production env vars wrong.
- API harness points to wrong environment.
- Provider outage alert missing.
- Old migration fails on empty DB.
- Beta invite sent before source health dashboard is ready.
- Rollback requires disabling source but owner is unavailable.
- Generated API client/harness uses stale OpenAPI contract.
- Restore drill passes DB data but misses outbox/inbox state.
- Ring expansion is requested while queue lag, cost burn or provider rate-limit pressure is already high.
- Capacity evidence passes globally but hides a noisy tenant.

## Pay Attention

- Launch readiness is evidence-based.
- Do not accept "works on my machine".
- Every blocker gets owner and severity.
- Launch evidence must be reproducible and linkable.
- If a drill fails, classify as blocker or accepted MVP gap with owner before invite.
- A beta invite is an operational commitment; do not expand rings without capacity evidence.

## Acceptance Criteria

- Release checklist complete.
- No critical security findings.
- Incident/runbook links exist.
- Beta deployment is reproducible.
- Launch evidence bundle is complete.
- Expansion decision process is documented.
- Capacity envelope, degradation policy and ring thresholds are included in launch evidence.
