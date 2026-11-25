# Iteration 00 - Quality Metrics And KPIs

## Primary Quality Signals

| Metric | Target |
| --- | --- |
| Bounded contexts with named owner | 100% |
| Core aggregates with documented invariants | 100% |
| Source classes with allowed/rejected decision | 100% |
| Contract families with versioning rule | REST, events, gRPC |
| Tickets that include context/layer/tests/edge cases | 100% |

## Failure Signals

- Source policy leaves room for unsafe production scraping.
- Context ownership is ambiguous.
- MVP scope cannot be mapped to the end-to-end loop.

## Review KPI

Foundation is healthy when implementation can start without inventing architecture rules inside tickets.
