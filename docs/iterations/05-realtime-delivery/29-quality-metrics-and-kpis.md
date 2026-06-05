# Iteration 05 - Quality Metrics And KPIs

## Primary Quality Signals

| Metric | Target |
| --- | --- |
| Unauthorized channel joins blocked | 100% |
| Reconnect/resync success in test | 100% |
| Duplicate event notification duplicates | 0 |
| Realtime DTOs with version | 100% |
| Delivery failures with log record | 100% |

## Failure Signals

- Missed events cannot be recovered.
- WebSocket auth is weaker than REST.
- Notification idempotency is unclear.

## Review KPI

Realtime is healthy when mobile status can be trusted after disconnects and retries.
