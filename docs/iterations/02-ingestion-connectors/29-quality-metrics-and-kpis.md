# Iteration 02 - Quality Metrics And KPIs

## Primary Quality Signals

| Metric | Target |
| --- | --- |
| Connector certification pass rate | 100% for fake/HN/RSS |
| Repeated scan duplicate rate | 0 unexpected duplicates |
| Dead-letter entries with actionable context | 100% |
| Feed items with source provenance | 100% |
| Worker lease duplicate processing incidents | 0 in tests |

## Failure Signals

- Cursor is saved before durable writes.
- Provider errors are unclassified.
- Dedupe cannot explain why items merged.

## Review KPI

Ingestion is healthy when HN/RSS scans can repeat safely and feed output is reliable enough for summaries.
