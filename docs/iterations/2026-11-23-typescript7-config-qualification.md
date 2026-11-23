# TypeScript 7 compatibility — Stage T0 (configuration preparation)

**Status: DRAFT / NOT MERGE QUALIFIED.** Parent: current `main` after architecture #790. This is a bounded prerequisite to the still-open #791 → #792 → #793 refactor/SDK stack, not a substitute for their native end-to-end gates.

## Verified blocker

A native `typescript@7.0.2` execution on #791 failed at configuration validation: removed `baseUrl` (TS5102) and 34 nonrelative `paths` entries (TS5090). Evidence: [#791 qualification checkpoint](https://github.com/777genius/social-monitor/pull/791#issuecomment-7097102480). That run did **not** execute source typechecking, Nest decorator emit, Jest or PostgreSQL E2E.

The organization [Engineering Quality Standard](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md#typescript-for-javascript-runtimes) requires TypeScript >=7.0.2, including embedded parser/compiler instances used for new maintained work. The current Social Monitor backend still declares `typescript@^6.0.3`; `ts-jest`, `ts-node`, `typescript-eslint`, the architecture import parser and the emitted-alias rewriter consume the old JS compiler API. Native TS7 is **not** a drop-in replacement. No permission to execute the older parser as new qualification evidence, install an alias shim, weaken checks, or silently adopt a split-compiler runtime is inferred from this plan.

## Exact scope of T0

1. Remove the obsolete `baseUrl: "."` and `ignoreDeprecations: "6.0"` options from `tsconfig.json`.
2. Make all existing `paths` target values explicitly project-relative (prefix `./`). Do not add/delete an alias, change a source location, loosen compiler strictness, modify decorator settings, generated contracts, `rootDir`, `outDir`, module format, test inventory or business logic.
3. Adjust the existing architecture guard's bounded-context source discovery to accept the now-explicit `./libs/...` targets while preserving all rejection checks and the existing ten exact legacy exception tuples. The existing fixture matrix already proves cross-context imports and alias/runtime cycles; this must continue on the owning native7 pipeline.
4. Preserve the alias rewriter's `options.baseUrl ?? options.pathsBasePath ?? dirname(configPath)` path resolution; it already falls back to config location. Confirm emitted JS/declaration semantic parity when the source compiler migration is qualified.
5. No runtime dependency, SQL change, new JS/MJS source or new test runner in this slice.

## Mandatory integration T1 (not claimed complete by T0)

- Move the **owning compiler** and **every** parser/compiler API actually used by the maintained toolchain to supported TypeScript >=7.0.2, including transitive/embedded versions, with a legitimate API migration. Do not use `@typescript/typescript6` as the parser to greenwash a native7 build.
- Replace unsupported TypeScript6 Compiler API calls in the architecture scanner and alias rewriter with supported native tooling or bounded independently reviewed implementations, maintaining literal/dynamic/require/static/type-only import coverage and fail-closed alias resolution.
- Qualify `ts-jest` and `ts-node` replacements at their owner (including Nest decorator metadata, alias resolution and full unit/E2E inventory). Keep the existing strict type-aware lint coverage and fail closed on missing metadata; no `isolatedModules` or test skip bypass.
- Generate the **real** npm lockfile using the repository's package manager; verify package integrity, engine/peer compatibility and dependency admission. Do not hand-edit lock integrity or invent published versions.
- Run actual native TypeScript >=7.0.2 `--noEmit` and build, compare required emitted Nest metadata/SDK exports with the accepted behavior, then full canonical 20/20 native GitHub CI, PostgreSQL18, RabbitMQ, security, 6 unit shards, all backend E2E, Docker/host and frontend tests on one qualified exact tree.
- Retarget/requalify the stacked #791/#792/#793 in order, preserve the concurrently-owned #665 code, and validate a protected owner merge plus postmerge main E2E. QUEUED, SKIPPED, CANCELLED, old-head and TS6 runs do not qualify.

## Five review passes / limits

1. **Scope:** this T0 PR touches only the compiler config, a small legacy architecture-guard compatibility correction and this plan. It does not add a new source responsibility to the legacy MJS file.
2. **Type safety:** preserve all previous options except two obsolete fields; preserve ordered alias keys and their exact targets after stripping one `./` prefix; no new wildcard or module-resolution fallback.
3. **Security:** do not weaken domain importer gating; check foreign root alias and exact-ten-exception synthetic tests after native7 implementation.
4. **Runtime:** Nest decorated DI, CommonJS output, Prisma and SDK identity remain unchanged; these are *qualification obligations*, not assumed proven by config JSON.
5. **Merge:** T0 remains Draft while the original TS7 toolchain compatibility blocker and final CI gates are open. An upstream issue or a partial local config proof is not E2E or permission to merge.

**Complexity estimate:** T0 ≈ 4–8 modified maintained executable lines plus 34 configuration target-prefix edits; T1 is a separate substantial toolchain migration requiring its own implementation estimate after npm ecosystem/API qualification. T0 complexity 2/10, expected standalone reliability 7/10, confidence 8/10 in config equivalence; full project target-profile confidence remains low pending T1. No new production logic is authorized by this stage.
