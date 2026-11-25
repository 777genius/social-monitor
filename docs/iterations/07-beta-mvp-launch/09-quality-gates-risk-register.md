# Iteration 07 - Quality Gates And Risk Register

## Hard Gates

1. MVP scope is frozen.
2. Supported sources are explicit.
3. Known limitations are documented.
4. Onboarding flow is tested.
5. Support runbook exists.
6. Incident severity levels exist.
7. Launch checklist is complete.
8. Feedback taxonomy exists.
9. Beta metrics dashboard exists.
10. Next-source decision process is evidence-based.

## Architecture Checks

- No beta workflow depends on an unapproved source adapter.
- Support can see scan and summary failure state.
- Feedback is linked to topic/source/summary context.
- Source expansion requires capability profile and risk class.
- Launch does not bypass production hardening gates.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Beta users demand X/Twitter immediately | Scope pressure | Document source roadmap and provider-safe requirement. |
| Summary feels low quality due to vague topic | False product signal | Add onboarding guidance and feedback categories. |
| Provider quota fails during beta | Broken demo/workflow | Quota monitoring and clear source status. |
| Support cannot diagnose failures | Slow response | Runbooks and dashboards before launch. |
| Feedback is anecdotal only | Wrong roadmap | Track activation, scan success, summary usefulness and missing sources. |

## Edge Cases To Recheck

- User creates too many topics for beta quota.
- Mobile/backend version mismatch.
- Feed has data but summary is delayed.
- User wants unsupported private/closed source.
- Source is healthy but topic query is too narrow.

## Transition Criteria

Close MVP only when beta users can complete the full loop and the team has evidence for the next source and product priorities.
