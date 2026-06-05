# Iteration 06 / Phase 03 - CI/CD And Supply Chain

## Objective

Make builds, tests and releases trustworthy.

## Steps

1. Add CI stages: lint, typecheck, unit, integration, contract, build.
2. Add generated-code freshness checks.
3. Add dependency and secret scanning.
4. Add container builds.
5. Add SBOM/provenance generation.
6. Add image signing plan.
7. Add deployment manifests.

## Required CI Gates

| Gate | Blocks Merge | Evidence |
| --- | --- | --- |
| architecture imports | yes | domain/use cases cannot import Nest/ORM/broker/generated DTOs |
| unit tests | yes | domain/use-case/store tests |
| integration tests | yes for changed services | DB/broker/provider fake paths |
| OpenAPI generation drift | yes | deterministic generated spec/client |
| event schema compatibility | yes | version/envelope compatibility |
| migration clean DB | yes | apply from empty DB |
| migration upgrade path | yes | apply over seeded beta dataset |
| tenant isolation negative tests | yes | API/repository/worker/event consumer |
| secret scanning | yes | no secrets in repo/fixtures |
| dependency vulnerability scan | warning/block by severity | exception workflow required |
| container build | yes before deploy | image digest and SBOM |

## Release Artifact Rules

1. Deploy immutable container image by digest.
2. Generated contracts are part of the artifact evidence.
3. SBOM is generated for backend services and mobile release artifacts where supported.
4. Production deploy requires migration plan and rollback/stop-workers plan.
5. CI credentials use least privilege and cannot read provider secrets unless required for secure deploy.
6. Exceptions have owner, expiry date and mitigation.

## Edge Cases

- Generated client stale.
- Testcontainers unavailable in CI.
- Secret committed in fixture.
- Dependency update breaks generated code.
- Event schema change passes unit tests but breaks consumer.
- Migration test passes on empty DB but fails on upgraded beta data.
- CI cache hides generated contract drift.
- Vulnerability exception never expires.
- Build uses mutable dependency or image tag.

## Pay Attention

- CI permissions are least privilege.
- Production artifacts deploy by digest.
- Security scans need exception workflow.
- Keep CI gates fast enough for daily delivery, but make beta blockers non-optional.
- Contract/schema gates should run before expensive end-to-end tests.

## Acceptance Criteria

- CI blocks bad imports and stale contracts.
- Container image builds reproducibly.
- SBOM exists for service.
- Secret scanning is enabled.
- CI gate list is explicit and each beta blocker has an automated or manual evidence path.
