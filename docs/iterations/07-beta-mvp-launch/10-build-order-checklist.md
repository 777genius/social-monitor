# Iteration 07 - Build Order Checklist

## Build Order

1. Freeze MVP scope.
2. Freeze supported sources.
3. Document known limitations.
4. Prepare onboarding flow.
5. Seed demo topics and sources.
6. Prepare support runbook.
7. Define incident severity.
8. Verify launch checklist.
9. Run full E2E flow.
10. Run failure scenarios.
11. Verify beta metrics.
12. Launch limited beta.
13. Collect feedback.
14. Classify missing source requests.
15. Decide next iteration from evidence.

## First PR Sequence

1. PR 1: beta scope table, known limitations and source freeze.
2. PR 2: onboarding guide/copy and source limitation UX.
3. PR 3: support intake taxonomy and support-safe dashboard checks.
4. PR 4: launch evidence bundle template and go/no-go gates.
5. PR 5: fresh-tenant E2E and failure scenario scripts.
6. PR 6: rollback/pause-source procedure and incident severity rules.
7. PR 7: beta metrics dashboard and feedback taxonomy.
8. PR 8: post-beta backlog classification workflow.
9. PR 9: internal dogfood and private beta ring 1 evidence.
10. PR 10: ring expansion decision record.

## Contracts First

- Beta scope contract.
- Support workflow.
- Feedback taxonomy.
- Source expansion decision rule.
- Rollback checklist.
- Known limitations policy.
- Launch evidence bundle.
- Beta ring expansion criteria.
- Post-MVP backlog classification.

## Tests And Checks

- End-to-end MVP flow.
- Multi-tenant isolation scenario.
- Provider quota failure scenario.
- Summary failure scenario.
- Mobile/backend version compatibility.
- Fresh tenant E2E.
- Support triage drill.
- Source outage/disable-source drill.
- Feedback classification evidence check.
- Known limitation visibility check.

## Edge Cases Before Closure

- User wants unsupported source.
- Topic is too vague.
- Feed has items but summary delayed.
- Provider quota exhausted during onboarding.
- User exceeds beta quota.
- Beta invite sent before support/runbooks are ready.
- User requests unsupported source as first workflow.
- Summary is useful but arrives too late for user value.
- Ring expansion requested while blocker remains open.

## Closure

Close only when beta users complete the full loop and feedback is mapped to next-source/product priorities.
