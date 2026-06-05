# Security, Compliance & Operations

## Identity

Do not build a custom identity provider.

Use:

- OIDC/OAuth for users;
- Authorization Code + PKCE for public/mobile clients;
- short-lived access tokens;
- refresh token rotation;
- auditable session lifecycle;
- SCIM later for enterprise provisioning.

References:

- OpenID Connect Core: https://openid.net/specs/openid-connect-core-1_0-18.html
- OAuth 2.0 Security BCP RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- PKCE RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
- SCIM RFC 7644: https://datatracker.ietf.org/doc/rfc7644/

## Secrets

Kubernetes Secrets are delivery mechanism, not full secret management.

Production:

- Vault/cloud secret manager;
- External Secrets Operator or CSI;
- Kubernetes encryption at rest;
- short-lived credentials where possible.

References:

- Vault DB secrets: https://developer.hashicorp.com/vault/docs/secrets/databases
- Kubernetes encryption at rest: https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/

## Compliance

Compliance is a bounded context.

Content states:

```text
active
stale_needs_recheck
deleted_at_source
modified_at_source
restricted
tombstoned
purged
legal_hold
```

Jobs:

```text
source_content_recheck_job
platform_deletion_sync_job
tenant_retention_purge_job
raw_payload_expiry_job
backup_purge_marker_job
```

References:

- GDPR Article 25: https://gdpr-info.eu/art-25-gdpr/
- GDPR Article 17: https://gdpr-info.eu/art-17-gdpr/
- X Developer Policy: https://developer.x.com/en/developer-terms/agreement-and-policy/source.html
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms

## Observability

Use OpenTelemetry from day one.

Required attributes:

```text
tenant_id
correlation_id
scan_run_id
connector_run_id
source_type
provider
idempotency_key
queue_message_id
```

Do not log or trace secrets, raw source content, prompts with secrets, cookies or provider tokens by default.

References:

- OpenTelemetry messaging: https://opentelemetry.io/docs/specs/semconv/messaging/
- OpenTelemetry GenAI: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- W3C Trace Context: https://www.w3.org/TR/trace-context/

## Runtime & Release Governance

Use:

- HPA for API/realtime services;
- KEDA for RabbitMQ/Kafka workers;
- canary/blue-green rollout for risky deployments;
- policy-as-code for runtime guardrails;
- signed production container images.

References:

- Kubernetes HPA: https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/
- KEDA RabbitMQ: https://keda.sh/docs/2.20/scalers/rabbitmq-queue/
- KEDA Kafka: https://keda.sh/docs/2.19/scalers/apache-kafka/
- Kyverno: https://kyverno.io/docs/introduction/
- Sigstore Cosign: https://docs.sigstore.dev/cosign/signing/signing_with_containers/

## Incident Policy

P0:

- tenant isolation breach;
- credential leak;
- compliance deletion failure;
- data loss;
- billing/cost runaway.

Required kill switches:

- disable source;
- disable provider;
- pause tenant expensive ops;
- pause backfill;
- pause summaries;
- force compliance queue priority;
- quarantine connector version.

Reference:

- NIST SP 800-61 Rev. 3: https://csrc.nist.gov/pubs/sp/800/61/r3/final

