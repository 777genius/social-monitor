# 114. Secrets and Runtime Config

## Status

Locked for implementation blueprint.

## Research Anchors

- Kubernetes Secrets: https://kubernetes.io/docs/concepts/configuration/secret/
- External Secrets Operator CNCF project: https://www.cncf.io/projects/external-secrets

## Decision

Separate configuration, secrets and tenant/provider credentials. Do not treat environment variables as the whole secrets strategy.

## Classes

| Class | Examples | Storage |
|---|---|---|
| static config | feature flags defaults, URLs, log levels | config maps / env |
| deployment secrets | DB password, broker credentials | external secret manager -> Kubernetes secret |
| tenant credentials | Reddit OAuth token, Telegram token | encrypted credential store |
| signing keys | webhook HMAC secrets, JWT keys | KMS/secret manager with rotation |
| API keys | user-created API keys | hashed/tokenized application store |

## Kubernetes Rules

- Enable encryption at rest for Kubernetes secrets.
- Prefer external secret manager synchronized into cluster.
- Restrict RBAC access to secrets by namespace/service account.
- Do not mount broad secret bundles into every service.
- Rotate secrets without image rebuild.
- Avoid putting secrets in logs, metrics, traces, crash dumps or build artifacts.

## Runtime Config Rules

- Runtime config is validated on service boot.
- Dangerous defaults fail closed.
- Feature flags cannot bypass authorization, entitlement or compliance checks.
- Config changes that affect source policy, retention or billing require audit events.

## Best-Fact Choice

Kubernetes Secrets are a delivery mechanism, not a complete secrets management system. The durable source of truth should be an external secret manager plus application-level encrypted credential storage.

