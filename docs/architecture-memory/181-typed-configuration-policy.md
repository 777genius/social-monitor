# 181. Typed Configuration Policy

## Status

Locked for platform baseline.

## Research Anchors

- NestJS configuration: https://docs.nestjs.com/techniques/configuration
- NestJS validation: https://docs.nestjs.com/techniques/validation

## Decision

Runtime configuration must be typed, validated at boot and owned. A service should fail fast on invalid dangerous config.

## Config Classes

| Class | Examples | Change Control |
|---|---|---|
| deployment config | URLs, ports, log level | normal deploy/config PR |
| feature flags | source kill switch, canary | flag owner/audit |
| policy config | retention, source terms version | reviewed/audited |
| limits config | plan quotas, queue concurrency | product/platform approval |
| secrets refs | secret names, key ids | security/platform approval |

## Rules

- Every service has a config schema.
- Config is parsed into typed objects, not read ad hoc from `process.env`.
- Boot fails on missing required config.
- Dangerous defaults fail closed.
- Config values that affect billing, retention, source policy or auth emit audit/change records.
- Secrets are referenced, not embedded.

## Best-Fact Choice

Typed config is part of reliability. Many production incidents are config incidents; schema validation catches them before traffic reaches the service.

