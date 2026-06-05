# Iteration 05 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-websocket-service | Gateway, auth, channels, resync | WebSocket service | Mobile recovers status |
| 02-notifications-digests | Preferences, read model, digest jobs | Notification model | No duplicate notifications |
| 03-webhooks-api-keys | API keys, webhooks, signing, logs | Delivery base | Failures are logged |
| 04-mcp-future-interface | Future interface planning | Extension notes | Kept out of beta path |

## Ticket Cutting Rule

Each realtime ticket must state auth impact, versioning impact and missed-event recovery behavior.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
