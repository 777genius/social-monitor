# 260 - ADR Change Governance Policy

## Decision

Architecture decisions are tracked as Markdown memory plus ADRs for decisions that change direction, add major dependencies or affect long-term operability.

The architecture memory is the working knowledge base. ADRs are the decision record for consequential choices.

## Sources

- Michael Nygard ADRs: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- The Open Group Architecture Decision Records: https://adr.github.io/
- GitHub Markdown docs: https://docs.github.com/en/get-started/writing-on-github

## When To Write An ADR

Required for:

- new database/search/broker technology
- switching AI provider strategy
- changing API protocol boundary
- changing source acquisition strategy
- changing auth/session model
- changing multi-tenant isolation model
- adding paid provider dependency
- breaking public API compatibility
- changing data retention/security posture

Not required for:

- small implementation detail
- test-only helper
- documentation wording update
- minor bug fix within an existing decision

## ADR Format

```text
# ADR-XXXX - Title

Status: Proposed | Accepted | Superseded | Deprecated
Date:
Owners:

## Context
## Decision
## Consequences
## Alternatives Considered
## Follow-up Work
```

## Status Policy

Statuses:

- `Proposed`
- `Accepted`
- `Superseded`
- `Deprecated`

Never edit history to hide an old decision. Supersede it with a new record.

## Architecture Memory Updates

When an ADR is accepted:

- update relevant architecture-memory files
- update `00-index.md` if new docs are added
- link ADR from relevant memory doc
- update roadmap/checklists if implementation impact exists

## Review Rules

Major ADRs need review from:

- backend owner
- frontend owner if client-impacting
- security/privacy owner if data/auth-impacting
- SRE/ops owner if runtime-impacting
- product owner if UX/business-impacting

For personal MVP, one owner may fill multiple roles but the checklist still applies.

## Decision Reversal

Reversals require:

- reason old decision no longer holds
- migration path
- risk assessment
- rollback plan
- affected docs/contracts/tests

## Architecture Rule

Documents are not the architecture.

The enforced contracts, tests, module boundaries and runtime behavior must reflect the documents.
