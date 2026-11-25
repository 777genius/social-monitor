# URL, Webhook & SSRF Safety

Date: 2026-05-31
Status: baseline URL/SSRF memory

## Decision

Any user-provided URL is potentially hostile.

Applies to:

- RSS feed URLs;
- webhook endpoint URLs;
- import URLs later;
- source URLs;
- provider callback URLs if configurable.

References:

- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP SSRF overview: https://owasp.org/www-community/attacks/Server_Side_Request_Forgery
- RFC 3986 URI Generic Syntax: https://www.rfc-editor.org/rfc/rfc3986

## Allowed Schemes

Default allowed schemes:

```text
https
http only where explicitly allowed for local/dev or source policy
```

Forbidden by default:

```text
file
ftp
gopher
ldap
dict
mailto
data
javascript
unix socket schemes
```

## SSRF Protections

Required:

- parse URLs using a standards-compliant parser;
- reject private/internal IP ranges;
- reject link-local/metadata service ranges;
- resolve DNS and validate final IP;
- protect against DNS rebinding by re-validating on connect where possible;
- limit redirects and revalidate every redirect target;
- timeout and response size limits;
- egress restrictions at network layer.

## Webhook Endpoint Validation

For outbound webhooks:

- require HTTPS in production;
- optional domain verification for high-trust integrations later;
- HMAC-sign payloads;
- enforce timeout;
- bounded retries;
- SSRF protection;
- no internal IP/private network destinations by default.

## Locked Decisions

1. User-provided URLs are hostile input.
2. SSRF defense uses parsing, DNS/IP validation and network egress controls.
3. Redirect targets are revalidated.
4. Webhook endpoints require HTTPS in production.
5. Internal/private network targets are denied by default.

