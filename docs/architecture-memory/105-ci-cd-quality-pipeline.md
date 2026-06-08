# 105. CI/CD Quality Pipeline

## Status

Locked for architecture baseline.

## Research Anchors

- GitHub Actions reusable workflows: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- OpenAPI Generator dart generator: https://openapi-generator.tech/docs/generators/dart/
- Confluent Schema Registry compatibility: https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html

## Decision

Use reusable CI workflows and contract gates. The pipeline must protect architectural boundaries, not just compile code.

## Required Pull Request Gates

Backend:

- format;
- lint;
- code-quality guardrails;
- TypeScript typecheck;
- unit tests;
- architecture dependency checks;
- Prisma migration check;
- OpenAPI generation check;
- Protobuf generation check;
- event schema compatibility check;
- Docker build for changed deployables.

Frontend:

- `flutter analyze`;
- unit/widget tests;
- generated client freshness check;
- MobX codegen check;
- design-system import boundary check.

Security:

- dependency audit;
- secret scan;
- container scan;
- license/SBOM generation for release candidates.

## Release Pipeline

Stages:

1. Build immutable artifacts.
2. Run contract compatibility checks.
3. Run database migration dry-run where possible.
4. Deploy to staging.
5. Run smoke and connector fake-adapter tests.
6. Promote with manual approval for production until confidence is high.
7. Run post-deploy smoke checks and SLO watch.

## Reusable Workflows

Create reusable workflows for:

- backend quality;
- Flutter quality;
- contract generation;
- migration validation;
- container build;
- deploy staging;
- deploy production.

Avoid copy-pasted workflow files across services. Copy-paste CI becomes invisible technical debt.

## Best-Fact Choice

The CI/CD system is the enforcement layer for Clean Architecture, generated contracts and schema compatibility. Without gates, architecture docs become advisory instead of operational.

## Locked Code-Quality Gate

`npm run check:code-quality` must run in `npm run verify` before expensive build/test stages. It blocks:

- missing feature use-case specs;
- thrown `DomainError` from feature use cases;
- direct in-memory adapter construction inside feature use cases;
- tenant-scoped REST controllers without `requireTenantScope(...)`;
- production `console.*` calls.

## Release Gate Coverage

`npm run check:release` must prove that every blocking gate listed in `ops/release/mvp-release-evidence-contract.json` is present in `npm run verify`. A gate that exists as a package script but is not part of standard verification is treated as not enforced.
