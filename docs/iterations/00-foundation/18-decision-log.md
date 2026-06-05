# Iteration 00 - Decision Log

## Decision 001 - Build Production-Shaped MVP

- Decision: Design the MVP as multi-tenant and adapter-based from day one.
- Alternatives: Single-user script, scraper-first prototype.
- Rationale: Future scale requires tenant boundaries, source abstraction and auditable summaries.
- Consequences: More upfront architecture work, less rewrite risk.
- Revisit When: Product intentionally becomes single-user only.

## Decision 002 - Official/Open/Provider Source Strategy

- Decision: Use official APIs, open APIs, RSS and licensed/provider adapters for production ingestion.
- Alternatives: Browser automation or bot-detection bypass.
- Rationale: Reliability, legal safety and operability matter more than short-term source reach.
- Consequences: Some sources may be delayed until safe access path exists.
- Revisit When: A source provides approved, reliable and compliant access.
