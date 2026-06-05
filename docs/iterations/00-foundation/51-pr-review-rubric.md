# Iteration 00 - PR Review Rubric

## Review Goal
Ensure foundation PRs make implementation clearer and do not introduce ambiguous architecture decisions.

## Architecture Checks
- Bounded context language is precise.
- Tenant assumptions are explicit.
- Source acquisition policy is production-safe.
- Contract language is framework-neutral.

## Test And Evidence Checks
- Examples cover happy and negative cases.
- Source policy includes allowed, restricted and blocked paths.
- Contract examples include version, tenant scope and idempotency.

## Edge Case Checks
- Personal-use shortcut does not remove future multi-tenancy.
- New source request has risk classification.
- Glossary term is not duplicated under another name.

## Merge Blockers
- Ownerless context or decision.
- Unclassified source strategy.
- Contract standard too vague for implementation.
