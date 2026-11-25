# 269 - Kubernetes Secrets External Store Policy

## Decision

Kubernetes Secrets are delivery artifacts for runtime, not the primary secret management system.

Production secrets live in an external secret manager and are synced or mounted into Kubernetes through a controlled mechanism.

## Sources

- Kubernetes Secrets: https://kubernetes.io/docs/concepts/configuration/secret/
- Kubernetes secret good practices: https://kubernetes.io/docs/concepts/security/secrets-good-practices/
- External Secrets Operator: https://external-secrets.io/
- Secrets Store CSI Driver: https://secrets-store-csi-driver.sigs.k8s.io/

## Why This Is Locked

Kubernetes documents that Secrets are stored unencrypted in etcd by default unless encryption at rest is configured.

For production, this is not enough as the only secret boundary.

## Secret Sources

Use external secret manager for:

- database credentials
- provider API secrets
- OAuth client secrets
- JWT/signing keys
- webhook signing secrets
- encryption keys
- mobile signing credentials metadata if applicable

Kubernetes receives only the runtime material required for a workload.

## Delivery Options

Allowed:

- External Secrets Operator syncing to Kubernetes Secret
- Secrets Store CSI Driver mounting secrets
- cloud-provider native workload identity to fetch secrets

Choice depends on cloud/runtime environment.

## Rotation

Every secret has:

- owner
- rotation interval
- rotation procedure
- blast radius
- dependent workloads
- validation method

Rotation must be tested in staging.

## Access Control

Kubernetes RBAC must restrict:

- reading Secrets
- listing Secrets
- editing ExternalSecret/SecretStore objects
- mounting secrets into pods

ServiceAccounts receive only secrets needed by that workload.

## Git Policy

Do not store plaintext secrets in Git.

If sealed/encrypted secret manifests are used, key management and rotation must be documented. External secret references are preferred.

## Audit

Audit:

- secret reads where platform supports it
- secret rotation
- failed sync
- ExternalSecret changes
- service account permission changes

## Architecture Rule

Git stores references and intent.

Secret managers store secrets.

Kubernetes delivers only scoped runtime access.
