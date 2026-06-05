# Iteration 07 - Architecture Compliance Audit

## Audit Goal
Verify that beta launch validates the core MVP loop without uncontrolled scope expansion or architecture shortcuts.

## Required Checks
- Beta scope is frozen and tied to supported source capabilities.
- Known limitations are explicit and supportable.
- Launch/rollback gates are named and owner-backed.
- Feedback taxonomy maps user reports to roadmap decisions.
- Unsupported source requests do not bypass source policy.

## Critical Violations
- New source is added during beta without policy/capability review.
- Launch proceeds without rollback trigger.
- Feedback becomes roadmap without evidence classification.
- Support process depends on undocumented engineering knowledge.

## SOLID And Clean Architecture Focus
- Beta changes must go through existing ports/adapters and bounded contexts.
- Product feedback must not create cross-context shortcuts.
- Post-MVP roadmap decisions must preserve architecture guardrails.

## Evidence Required
- Beta scope freeze.
- Known limitations document.
- Launch checklist.
- Rollback/pause owner list.
- Feedback and metrics report.

## Closure Rule
Post-MVP expansion cannot start until beta findings are converted into reviewed backlog items and architecture decisions.
