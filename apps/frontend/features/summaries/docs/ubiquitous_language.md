# Summaries Ubiquitous Language

## Purpose

Owns workspace summaries, digests, summary review and insight workflow language.

## Core Terms

- Summary: user-facing generated explanation of monitored activity. The main
  Summary can aggregate all relevant posts, source mix, top reads, citations and
  next actions for the workspace.
- Digest: scheduled collection of summaries for a workspace or user.
- Briefing: internal/API term for a workspace-level generated summary artifact. Frontend copy should say Summary unless a backend workflow is being named.
- Insight: notable claim or pattern derived from monitored items.

## Forbidden Synonyms

- Do not expose model provider terms as summary domain language.
- Do not expose Briefing as a separate user-facing concept next to Summary.

## Rename Backlog

- Keep current backend/API `Briefing*` names until the contract can move safely.
- Future target: rename workspace-level briefing contract language to
  `WorkspaceSummary` or `ReaderSummary` across backend DTOs, OpenAPI,
  generated_api, mappers and tests.
- Until that migration lands, frontend presentation maps backend Briefing data
  to Summary copy.

## Open Questions

- Which summary confidence and citation states are visible in the MVP?
