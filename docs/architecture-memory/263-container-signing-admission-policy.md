# 263 - Container Signing Admission Policy

## Decision

Production container images are signed and verified by digest.

Use Sigstore/Cosign as the default image signing mechanism, with admission policy enforcement when Kubernetes runtime matures.

## Sources

- Sigstore overview: https://docs.sigstore.dev/
- Cosign signing containers: https://docs.sigstore.dev/cosign/signing/signing_with_containers/
- Cosign overview: https://docs.sigstore.dev/cosign/signing/overview/
- SLSA levels: https://slsa.dev/spec/v1.0/levels

## Signing Mode

Preferred:

- keyless signing through CI OIDC identity
- image signed by immutable digest
- signature and attestation stored in OCI registry/referrers where supported

Fallback:

- KMS-backed signing key with rotation and access audit

Avoid:

- long-lived signing keys stored as plain CI secrets
- signing mutable tags only

## What To Sign

Sign:

- backend service images
- worker images
- migration job images
- frontend/web images if introduced
- release artifacts where practical

Mobile app signing follows Apple/Google platform signing, but mobile build provenance is still recorded.

## Verification

Deployment should verify:

- image digest matches release manifest
- signature identity matches approved CI workflow
- provenance matches expected repository/branch
- SBOM exists
- vulnerability gate passed

Verification is first implemented in release pipeline and later enforced at cluster admission.

## Admission Policy

Kubernetes admission controller should eventually reject:

- unsigned images
- signature identity mismatch
- mutable tag without digest pin
- missing provenance for production
- disallowed base image
- image from unapproved registry

## Digest Pinning

Deployments use image digest references for production.

Tags are useful for humans, but digest is the deployment truth.

## Break-Glass

Emergency bypass requires:

- incident id
- approver
- expiry
- post-incident review
- backfilled signature/provenance where possible

## Architecture Rule

Build trust is verified before runtime trust.

Do not rely on registry tags as security boundaries.
