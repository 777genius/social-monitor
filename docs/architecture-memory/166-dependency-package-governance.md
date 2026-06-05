# 166. Dependency and Package Governance

## Status

Locked for supply-chain baseline.

## Research Anchors

- pnpm workspaces: https://pnpm.io/workspaces
- pnpm lockfile: https://pnpm.io/git
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers
- npm package provenance: https://docs.npmjs.com/generating-provenance-statements

## Decision

Use pnpm workspaces for the TypeScript monorepo and treat dependency updates as governed changes. Generated SDK/package publication must use CI-based trusted publishing where possible.

## Rules

- Commit `pnpm-lock.yaml`.
- Use one package manager per repo.
- Prefer workspace packages over unpublished copy-paste libraries.
- Centralize dependency versions where practical.
- Review new runtime dependencies for maintenance, license, security and bundle/runtime impact.
- Separate dev/test tooling from production dependencies.
- Pin critical build tooling enough to make codegen reproducible.

## Publication

For internal/external npm packages:

- publish from CI, not developer laptops;
- use trusted publishing/OIDC when supported;
- generate provenance attestations;
- publish only from protected branches/tags;
- include changelog and SemVer version.

## Best-Fact Choice

The dependency graph is part of architecture. A strict monorepo can still become fragile if package versions, generated SDKs and publishing are unmanaged.

