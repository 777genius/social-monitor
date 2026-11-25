# Iteration 00 - Developer Execution Playbook

## Reading Order
1. Read `00-iteration-overview.md`.
2. Read `26-mvp-scope-guardrails.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `39-contract-dependency-checklist.md`.
5. Read `40-implementation-risk-triage.md`.

## PR Slicing
- PR 1: glossary and product loop.
- PR 2: bounded context map.
- PR 3: source acquisition policy.
- PR 4: contract and event standards.
- PR 5: ticket quality and closure rules.

## Checks Before PR
- Every new term is in glossary.
- Every source decision has a risk class.
- Every context has an owner.
- Every contract rule includes tenant and versioning impact.

## Evidence To Attach
- Updated decision/source/context document.
- Review note showing owner approval.
- Traceability entry in `59-traceable-evidence-register.md`.
- Any rejected shortcut or deferred item with owner and reason.

## Architecture Guardrails
- Do not model sources as implementation shortcuts.
- Do not remove tenant requirements because usage starts personal.
- Do not let contract language depend on a specific framework or provider.

## Escalate When
- A source strategy cannot be classified.
- Two contexts claim the same responsibility.
- A rule cannot be turned into an implementation ticket.
