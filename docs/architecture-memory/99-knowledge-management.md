# 99. Knowledge Management

## Status

Locked for architecture baseline.

## Research Anchors

- NIST Cybersecurity Framework governance: https://www.nist.gov/cyberframework
- Development Containers specification: https://containers.dev/

## Decision

Architecture memory is part of the system. Keep it structured, owned and reviewed.

## Documentation Types

| Type | Purpose |
|---|---|
| Architecture memory | durable facts and decisions discovered during research |
| ADR | one important decision with context, options and consequences |
| Runbook | operational action during incident or maintenance |
| Playbook | repeatable engineering workflow |
| Contract docs | API/event/schema definitions |
| Product policy docs | source terms, privacy, limits and user-facing behavior |

## Rules

- `00-index.md` must list every architecture memory file.
- Files must stay focused; create a new file instead of mixing unrelated topics.
- Every locked decision should name its reason and boundary.
- Claims about changing external systems need dated sources or a review cadence.
- Old decisions are superseded by new files/ADRs, not silently edited away.

## Review Cadence

| Area | Review |
|---|---|
| source policy/pricing | monthly and before connector launch |
| security/privacy docs | quarterly and after incidents |
| AI/model docs | monthly while models/providers change quickly |
| API/schema docs | every release |
| runbooks | after every incident/test |

## Best-Fact Choice

The project is intentionally complex. Without disciplined docs, DDD/Clean Architecture will become ceremony instead of shared understanding.

