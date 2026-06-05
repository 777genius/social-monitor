# Iteration 05 - Implementation Readiness Scorecard

| Area | Ready When | Status |
| --- | --- | --- |
| Realtime | Event DTOs and channel model are defined | To review |
| Security | WebSocket auth/authorization matches REST | To review |
| Recovery | Reconnect/resync contract is clear | To review |
| Notifications | Idempotency and preferences are scoped | To review |
| Delivery | Logs and retry behavior are scoped | To review |
| Mobile | Subscription and recovery behavior are understood | To review |

## Go/No-Go Rule

Start notification work only after realtime auth and resync are green.

## Status Legend

- `Green` - documented, reviewed and backed by evidence.
- `Yellow` - owner, mitigation and deadline are written.
- `Red` - dependent work is blocked.
- `To review` - default state; not approval.

## Evidence Required

Attach the evidence in `59-traceable-evidence-register.md` before marking any row `Green`.
