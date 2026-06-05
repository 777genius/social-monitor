# 187. Request Body Limits

## Status

Locked for API gateway baseline.

## Research Anchors

- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

## Decision

Every public endpoint has explicit request size, field count and parsing limits. Large payloads use pre-signed object storage flows or streaming-specific endpoints.

## Limits

Define per route:

- max body size;
- max JSON depth;
- max array length;
- max string length;
- max file size;
- timeout;
- idempotency requirement;
- rate limit class.

## Large Content Policy

Do not accept large raw payloads through generic JSON APIs. Use:

- pre-signed upload URLs;
- object storage quarantine bucket;
- metadata record creation;
- async processing job;
- scan/validation before use.

## Best-Fact Choice

Payload limits are reliability controls. Without them, one tenant or malformed client can consume API memory, CPU and worker capacity.

