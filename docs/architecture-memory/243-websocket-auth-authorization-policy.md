# 243 - WebSocket Auth And Authorization Policy

## Decision

WebSocket connections are authenticated at handshake and authorized per subscription/message.

A valid connection does not imply access to every tenant/topic event.

## Sources

- WebSocket RFC 6455: https://datatracker.ietf.org/doc/html/rfc6455
- OWASP WebSocket Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Handshake Auth

Handshake must validate:

- access token/session
- tenant context if supplied
- origin where browser clients are used
- protocol version
- rate limits

Reject unauthenticated connections before subscription creation.

## Subscription Authorization

Every subscription request checks:

- user id
- tenant membership
- permission
- target resource ownership
- tenant/source visibility
- plan/entitlement where relevant

Examples:

```text
topic:{topic_id}:scan_status
source_binding:{source_binding_id}:health
tenant:{tenant_id}:notifications
summary:{summary_id}:status
```

Do not authorize by channel name string alone.

## Token Expiry

Long-lived WebSocket connections must handle token/session expiry.

Options:

- disconnect on expiry and require reconnect
- support explicit re-auth message
- server-side session revocation push

V1 should prefer simple disconnect/reconnect unless UX requires in-band refresh.

## Message Validation

All client messages need:

- schema validation
- max size
- allowed type
- idempotency/correlation id where needed
- rate limit

Unknown message types are rejected, not ignored silently.

## Reconnect Behavior

Client reconnects with:

- exponential backoff with jitter
- protocol version
- last seen event cursor where supported

Server does not guarantee all missed events over WebSocket. REST read models are used to rehydrate truth after reconnect.

## Logging

Log:

- connection open/close
- auth failure
- subscription accepted/denied
- rate-limit violation
- malformed message
- abnormal disconnect

Avoid logging payloads that include source content.

## Scaling

Realtime service uses:

- stateless WebSocket nodes where possible
- shared pub/sub or event projection
- per-tenant fanout limits
- backpressure/drop policy for non-critical events

## Architecture Rule

WebSocket is a notification channel, not an authorization shortcut and not canonical state.
