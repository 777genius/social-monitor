# 262 - SBOM Provenance Release Evidence

## Decision

Every production release produces release evidence:

- SBOM
- build provenance
- image digest
- git SHA
- test summary
- vulnerability scan summary
- deployment metadata

This evidence is retained and linked to the deployed artifact.

## Sources

- SLSA levels: https://slsa.dev/spec/v1.0/levels
- SLSA provenance: https://slsa.dev/spec/v1.0/provenance
- CycloneDX specification overview: https://cyclonedx.org/specification/overview/
- Sigstore overview: https://docs.sigstore.dev/

## SBOM Format

Use CycloneDX as the default SBOM format.

SBOMs should be generated for:

- backend services
- Flutter app dependencies
- container images
- infrastructure tooling where practical

SBOM must include:

- package name
- version
- package manager/ecosystem
- license metadata when available
- hashes where available
- generation tool metadata

## Provenance

Build provenance records:

- repository
- commit SHA
- workflow identity
- build command/process
- builder identity
- artifact digest
- source materials
- build timestamp

Target SLSA path:

- MVP: provenance exists and is stored.
- Production: provenance is signed/attested.
- Mature: provenance verified before deploy.

## Release Evidence Bundle

Each release stores:

```text
release_id
service/app
version
git_sha
image_digest
sbom_uri
provenance_uri
signature_uri
scan_report_uri
test_report_uri
deployed_at
environment
approved_by
```

## Vulnerability Scan

Scan SBOM/container before promotion.

Severity handling:

- critical: block unless explicit emergency exception
- high: block or time-boxed exception
- medium/low: tracked by SLA

Exceptions require owner and expiry date.

## Retention

Release evidence retention must be at least as long as:

- audit retention for deployments
- customer support/debug window
- legal/compliance requirements

Do not delete evidence when old images are garbage-collected without retaining metadata.

## Architecture Rule

A deployed artifact without provenance and SBOM is not production-ready.

Releases must be explainable after the fact.
