# Iteration 07 - Contract Dependency Checklist

## Purpose
Ensure beta launch and post-MVP planning respect the contracts established during MVP construction.

## Input Dependencies
- Supported source list and source policy.
- Hardening go/no-go gates.
- Onboarding and known limitation docs.
- Feedback taxonomy and metrics.

## Output Contracts
- Beta scope freeze.
- Launch and rollback checklist.
- Support triage contract.
- Feedback-to-roadmap contract.
- Post-MVP source expansion criteria.

## Owners
- Product owner owns beta scope and roadmap decisions.
- Engineering lead owns technical go/no-go criteria.
- Support owner owns triage and known limitations.
- Operations owner owns launch/pause evidence.

## Breaking-Change Risks
- Unsupported source request bypasses source policy.
- Beta feedback creates implementation work without architecture review.
- Launch checklist changes without owner approval.
- Roadmap prioritization ignores reliability and source risk.

## Transition Readiness
- Post-MVP work can be ranked by demand, risk and cost.
- Source expansion decisions reuse existing adapter/capability contracts.
- Beta findings become reviewed backlog items, not ad hoc changes.
