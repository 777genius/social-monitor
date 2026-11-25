# Supply Chain Security

Date: 2026-05-31
Status: baseline supply-chain memory

## Decision

Supply-chain security is required before production because the project will depend on many SDKs, connectors and container images.

## MVP Baseline

Required:

- dependency scanning;
- secret scanning;
- pinned versions;
- no `latest` container tags;
- reviewed base images;
- SBOM generation;
- license policy;
- Renovate/Dependabot-style update workflow.

## Production Baseline

Add:

- signed production container images;
- provenance attestations;
- admission policy verification;
- OpenSSF Scorecard checks where useful;
- restricted registries;
- vulnerability SLA by severity.

References:

- Sigstore/Cosign: https://docs.sigstore.dev/cosign/
- Sigstore overview: https://docs.sigstore.dev/
- OpenSSF Scorecard: https://github.com/ossf/scorecard
- SLSA: https://slsa.dev/

## Connector SDK Risk

Connector/provider SDKs are supply-chain risk multipliers.

Rules:

- connector dependencies are scoped;
- provider SDK versions are pinned;
- connectors run with limited permissions;
- provider SDK updates trigger connector certification tests;
- source/provider SDKs do not get direct access to core DB.

## Image Signing

Use Sigstore/Cosign for production images when moving toward production.

Keyless signing is preferred where CI identity integration is acceptable. KMS-backed signing is acceptable where organizational policy requires managed keys.

## Locked Decisions

1. No `latest` tags in production.
2. SBOM is required for production builds.
3. Production images are signed.
4. Provider SDK updates trigger certification.
5. Connectors are isolated partly because dependencies are untrusted.

