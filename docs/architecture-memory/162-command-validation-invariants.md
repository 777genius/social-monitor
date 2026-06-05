# 162. Command Validation and Invariants

## Status

Locked for implementation blueprint.

## Research Anchors

- NestJS validation techniques: https://docs.nestjs.com/techniques/validation
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/

## Decision

Validation is layered. API DTO validation protects boundaries; application validation checks permissions/context; domain invariants protect business correctness.

## Layers

| Layer | Validates | Examples |
|---|---|---|
| Transport DTO | shape, types, simple ranges | string length, enum, required field |
| Application command | actor/tenant/context | role, entitlement, idempotency, source state |
| Domain aggregate | invariant | scan interval must satisfy policy; topic cannot use deleted source |
| Persistence | uniqueness/referential integrity | unique external ids, foreign keys |
| Provider adapter | provider-specific constraints | supported sort/filter/scopes |

## Error Mapping

Use stable product errors:

- `validation_failed`;
- `unauthorized`;
- `forbidden`;
- `not_found`;
- `conflict`;
- `plan_limit_exceeded`;
- `source_policy_blocked`;
- `quota_exhausted`;
- `provider_unavailable`;
- `idempotency_conflict`.

Do not leak raw ORM/provider errors to public API.

## Invariant Policy

Domain invariants are duplicated nowhere. If UI needs a rule for UX, it mirrors server rules but server remains authority.

## Best-Fact Choice

Boundary validation is not domain validation. Keeping invariants in aggregates/use cases prevents invalid state from entering through workers, webhooks or future APIs.

