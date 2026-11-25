# Product Idea Backlog

Date: 2026-06-26
Status: exploratory backlog

This document stores product ideas that are not yet committed architecture decisions, ADRs or iteration scope. Promote an item into an ADR, implementation plan or ticket only after product, cost, legal and architecture review.

## Idea 001 - Optional Source Authenticity Research

Status: proposed
Area: content intelligence, summaries, source trust
Priority: later, optional paid/power-user capability

### Problem

Current summary quality controls can require citations and evidence, but a cited source can still repeat an unverified rumor, myth, coordinated narrative or low-quality claim. Users may need an optional mode that checks whether the summarized claim is backed by stronger independent evidence before it is treated as reliable.

### Idea

Add an optional feature that runs after ingestion, dedupe and summary evidence selection. For articles or source clusters that contribute to the final summary, the system performs extra research across more sources and assigns a verification result.

The feature should answer:

- Is this claim corroborated by multiple independent sources?
- Are the sources primary, reputable, official, expert, local, syndicated or low-quality?
- Is there conflicting evidence or only repetition of the same original rumor?
- Does the claim look like a myth, coordinated seed, speculation, satire or unconfirmed report?
- Should the summary mark the point as confirmed, likely, disputed, unverified or rumor-like?

### Scope Notes

- Must be optional per tenant, topic, summary policy or summary run.
- Must be cost and latency controlled because extra research can be expensive.
- Must not silently rewrite history or hide evidence. It should add a trust layer with cited reasoning.
- Must not become a generic "truth oracle". It should classify evidence quality and confidence.
- Must preserve provenance from original source item to deduped cluster, researched evidence and final summary point.
- Must show users when confidence is low instead of overclaiming certainty.

### Possible Output

- `verification_status`: `confirmed`, `likely`, `disputed`, `unverified`, `rumor_like`, `not_enough_evidence`
- `confidence_score`
- `supporting_sources`
- `conflicting_sources`
- `source_independence_score`
- `primary_source_present`
- `research_query_trace`
- short user-facing explanation with citations

### Risks

- Higher LLM/search/provider cost.
- Slower summary generation.
- False confidence if all corroborating sources copy the same origin.
- Legal/product risk if wording implies final factual authority.
- Source access limits for paywalled, regional or platform-restricted content.

### Implementation Direction

Start as a separate `SourceAuthenticityResearch` capability behind a feature flag and summary policy option. It should operate on frozen summary evidence and deduped clusters, then produce a separate verification artifact that summaries can reference.

Before implementation, define:

- evidence independence rules;
- source reputation and primary-source heuristics;
- conflict classification;
- provider/search budget limits;
- eval fixtures for rumor, confirmed, disputed and low-evidence cases;
- UI labels that communicate uncertainty clearly.

### Open Questions

- Should this be available only for selected high-risk topics or all summaries?
- Which source families are acceptable for verification evidence?
- Should users be able to require primary sources before a claim is marked confirmed?
- How should the system handle breaking news where reliable confirmation may lag?
