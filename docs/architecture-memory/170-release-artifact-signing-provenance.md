# 170. Release Artifact Signing and Provenance

## Status

Locked for supply-chain baseline.

## Research Anchors

- SLSA provenance: https://slsa.dev/spec/v1.0/provenance
- Sigstore overview: https://docs.sigstore.dev/
- Cosign container signing: https://docs.sigstore.dev/cosign/signing/signing_with_containers/
- npm provenance: https://docs.npmjs.com/generating-provenance-statements

## Decision

Release artifacts should have provenance and signatures before serious SaaS production. Start with CI-generated provenance; add admission verification when operationally ready.

## Artifacts

Sign or attest:

- container images;
- generated SDK packages;
- SBOMs;
- release bundles;
- infrastructure modules where published;
- mobile build metadata where feasible.

## Rules

- Build artifacts in CI from protected refs.
- Pin artifact by digest, not mutable tag.
- Generate SBOM for release candidates.
- Use npm trusted publishing/provenance for packages where supported.
- Use Sigstore/cosign for container signatures.
- Store provenance with release record.

## Enforcement Path

Phase 1:

- generate provenance and SBOM;
- manually verify for releases.

Phase 2:

- require signed images in deployment pipeline.

Phase 3:

- cluster admission policy verifies signatures/provenance.

## Best-Fact Choice

Provenance is most valuable when generated automatically by trusted CI. Manual signing from developer machines weakens the supply-chain story.

