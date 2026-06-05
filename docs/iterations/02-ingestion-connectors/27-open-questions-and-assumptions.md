# Iteration 02 - Open Questions And Assumptions

## Working Assumptions

1. HN and RSS are the first real adapters.
2. Every connector must expose capability profile.
3. Scheduled scans are idempotent.
4. Source provenance is required for summaries.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| What is the minimum scan interval per source class? | Ingestion/product | Before scheduler | Scan policy |
| Are HN comments in MVP or story-only first? | Product/ingestion | Before HN adapter | Normalization scope |
| How much raw provider metadata is retained? | Data/security | Before persistence | Storage/privacy |
| Which canonical URL rules are MVP-grade? | Feed owner | Before dedupe | Dedupe quality |

## Validation Rule

Do not add a new source before HN/RSS pass certification and repeated-scan tests.
