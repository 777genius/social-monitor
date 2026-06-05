# Iteration 02 - Architecture Decision Record Seeds

## Purpose
List ingestion decisions that must be durable before adding more social sources.

## ADR Seeds
- Define SourceProviderPort and capability profile.
- Use connector certification tests for every adapter.
- Define cursor commit semantics.
- Define normalized feed item schema.
- Approve HN/RSS as first low-risk sources.

## Alternatives To Capture
- Per-source pipelines vs shared provider port.
- Store raw provider payload downstream vs normalized feed domain.
- Cursor per provider page vs cursor after durable normalized writes.

## Consequences To Record
- Certification slows first adapter but speeds safe source expansion.
- Normalization avoids downstream provider coupling.
- Cursor discipline improves reliability but requires careful transaction design.

## Revisit Triggers
- A new source cannot fit capability profile.
- Normalized schema cannot represent required evidence.
- Provider limits require scheduler strategy change.
