# Backend source audit index 1 — architecture program 2026-11-23

## Purpose, authority and exclusions

Companion to `2026-11-23-backend-domain-boundary-program.md`; **this appendix is a path inventory, not a requirement to edit every file**. Each listed SHA and byte size originates from the pinned GitHub tree `c0f3ea3dd2f546ab5fd25f395e341cd2c5093541`. Architectural roles are *path-derived candidates*, not manually verified file semantics. Real changes need focused code reading and tests; no production implementation in Stage A.

Entries 1–1028 of 2055. This index exists to make scope audits and missing-file checks deterministic. Files excluded: Flutter, common generated, tests/spec suffixes, vendor, dist.

## Source-by-source change-control matrix

### 0001 `apps/agent-runtime/bin/assessment-cli-lifecycle.mjs`
- Baseline evidence: blob `984c17c7cfc8d567c565425b3ed1eac692d7e9e9`; 6118 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0002 `apps/agent-runtime/bin/assessment-cli-progress.mjs`
- Baseline evidence: blob `480c10e01cb49ca2044878ffd4c949ee334538ef`; 2572 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0003 `apps/agent-runtime/bin/assessment-cli-test-support.mjs`
- Baseline evidence: blob `248ccda0197d5730ca82a556f01bd23b446b5461`; 3573 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0004 `apps/agent-runtime/bin/codex-auth-pool-manifest.mjs`
- Baseline evidence: blob `c3f289e6d265231cc68d970b0370ad446aa1cbcd`; 7677 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0005 `apps/agent-runtime/bin/codex-auth-pool-routing.mjs`
- Baseline evidence: blob `a33c9eedcdda6196e056092749c020ff1bf2e66d`; 2543 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0006 `apps/agent-runtime/bin/codex-worker-cli-usage.mjs`
- Baseline evidence: blob `f6e583eedd23b5ed35a5948dd4fecdc9f155bfd3`; 2246 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0007 `apps/agent-runtime/bin/host-release.mjs`
- Baseline evidence: blob `f7f0a0855d3ce1b8eff11567d225546c56158a6a`; 20441 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0008 `apps/agent-runtime/bin/installed-runtime-modules.mjs`
- Baseline evidence: blob `3b7776badda63982927bcafc04df2723f5c89c9e`; 821 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0009 `apps/agent-runtime/bin/mimo-app-server-custody.mjs`
- Baseline evidence: blob `4780e1da897fa5aa5ed56be5fc561bf06393496e`; 1164 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0010 `apps/agent-runtime/bin/mimo-key-file.mjs`
- Baseline evidence: blob `4656d10a54284cc932566e51f2c9f398e7f7178b`; 2353 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0011 `apps/agent-runtime/bin/pinned-codex-native-binary.mjs`
- Baseline evidence: blob `7a959b592277eeb7313c2e070b2c8928853508b0`; 1135 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0012 `apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs`
- Baseline evidence: blob `4e9ecdde073950faeb27750751dbf7e7693bef75`; 3623 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0013 `apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs`
- Baseline evidence: blob `8034657191bdb359a3358e4a3c4de1e38d4f9ea8`; 36092 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0014 `apps/agent-runtime/bin/subscription-runtime-failure-details.mjs`
- Baseline evidence: blob `121a55d655656ac992186d22f08130b8ff621f4c`; 1548 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0015 `apps/agent-runtime/bin/subscription-runtime-purpose-model-policy.mjs`
- Baseline evidence: blob `dbc46187bc82a033122eb79e568280c067c0fa42`; 15949 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0016 `apps/agent-runtime/src/agent-runtime-executor.port.ts`
- Baseline evidence: blob `35050d489b8c83f8bd15005e46ea7a3821ef6d31`; 2087 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0017 `apps/agent-runtime/src/agent-runtime-grpc-service.ts`
- Baseline evidence: blob `437a699afb4d532e88c70f8d1431b1fa819b5ae2`; 10420 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0018 `apps/agent-runtime/src/agent-runtime-settings.ts`
- Baseline evidence: blob `186d58a4e0db871b8a826df5e52fc2aaeb02318f`; 4516 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0019 `apps/agent-runtime/src/backend-admission-policy.ts`
- Baseline evidence: blob `6a4270b5faf0b8f3f9306871c60e0f2c2d53ae00`; 1399 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0020 `apps/agent-runtime/src/main.ts`
- Baseline evidence: blob `f56e4a48d836062cb5d50de2e273ebe3a7a37e8e`; 2471 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0021 `apps/agent-runtime/src/mimo-presentation-completion.ts`
- Baseline evidence: blob `59b9ff0310f377202065a9d4fb118ffdef2a32a9`; 4512 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0022 `apps/agent-runtime/src/mimo-schema-root-policy.ts`
- Baseline evidence: blob `62561b189f2fe61c5ca8257b3680720da64af99c`; 1739 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0023 `apps/agent-runtime/src/reader-promotion-v2-canary-contract.ts`
- Baseline evidence: blob `99a753d71300ad2bfd3d5c25882eea626b2cfc8f`; 1256 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0024 `apps/agent-runtime/src/reader-summary-mimo-schema-markers.ts`
- Baseline evidence: blob `a2cba24c658ad1998c5d9c5452d316e6cc6c649f`; 1617 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0025 `apps/agent-runtime/src/runtime-output-failure-diagnostics.ts`
- Baseline evidence: blob `fb4905e5f5e94994fca482c6cfe0172aca3412c6`; 1758 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0026 `apps/agent-runtime/src/source-content-assessment-runtime.spec-support.ts`
- Baseline evidence: blob `92e780b20507e06e32fd5bf37fcafeebe52582b3`; 723 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0027 `apps/agent-runtime/src/strict-grpc-admission.ts`
- Baseline evidence: blob `82594e408d1823e3dd373294ae7f50b48781c95f`; 14471 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0028 `apps/agent-runtime/src/subscription-runtime-cli-executor.ts`
- Baseline evidence: blob `ed7a5a6eb8b4010451d3ec632445ede05e3a375f`; 16695 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0029 `apps/agent-runtime/src/subscription-runtime-cli-progress.ts`
- Baseline evidence: blob `6bc04c6feef9a73cf5df1badd68bf3d43c6ed7ec`; 3135 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0030 `apps/agent-runtime/src/subscription-runtime-cli-support.ts`
- Baseline evidence: blob `43e11c9398664726035c089ce86979671a9ef01c`; 13512 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0031 `apps/agent-runtime/src/subscription-runtime-execution-attestation.ts`
- Baseline evidence: blob `f9bd4b361de4efd998980972373f6100b37d346e`; 5932 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0032 `apps/agent-runtime/src/subscription-runtime-installation.ts`
- Baseline evidence: blob `382a7e056c0490c3b4e73999a049fab4f50c34f8`; 15243 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0033 `apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts`
- Baseline evidence: blob `8dc6ab6d95fc4595274a04d4aedc61dfef6e773e`; 16590 bytes; exact repository path.
- Owner classification: `apps/agent-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0034 `apps/api-gateway/src/api-gateway-runtime-readiness.ts`
- Baseline evidence: blob `c3b7914f33792d94603ed051aa78a363523dce06`; 5361 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0035 `apps/api-gateway/src/app-bootstrap-cache-refresher.ts`
- Baseline evidence: blob `4b03343ec267b835a86d5ed5bed82205df76e78c`; 1428 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0036 `apps/api-gateway/src/app-bootstrap-public-primer.ts`
- Baseline evidence: blob `90d37d1a993c0ba6b7f191eb70895fb7fff85285`; 2955 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0037 `apps/api-gateway/src/app-bootstrap-reader-summary-cache.ts`
- Baseline evidence: blob `68ca4b42ab8c420c81c4fa8e2d559273a732d2cd`; 3692 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0038 `apps/api-gateway/src/app-bootstrap-reader-summary-query.ts`
- Baseline evidence: blob `48ce7e5a4fc1351ee3bde451163ea57f40d20fff`; 2355 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0039 `apps/api-gateway/src/app-bootstrap.controller.ts`
- Baseline evidence: blob `2d78e7f21e409ac4bd214c76d112b01584bf6d31`; 1806 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0040 `apps/api-gateway/src/app-bootstrap.dto.ts`
- Baseline evidence: blob `6e2cacd90851cd3e3ef1dec16a3712f3a8cfe0af`; 1006 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0041 `apps/api-gateway/src/app.module.ts`
- Baseline evidence: blob `8f0b67e20df406c60cceb80e8c5294be90d50fc8`; 5535 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0042 `apps/api-gateway/src/domain-error.filter.ts`
- Baseline evidence: blob `74438101847d5919fdb32ccba0a901f105a917d8`; 8696 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0043 `apps/api-gateway/src/health-reporter.ts`
- Baseline evidence: blob `236200cc82d804b1c43fdc8e6d3c24bcc44e24c4`; 10202 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0044 `apps/api-gateway/src/health.controller.ts`
- Baseline evidence: blob `6f0fe2f5d7c6902441edf5834bfe0dac075d5613`; 875 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0045 `apps/api-gateway/src/main.ts`
- Baseline evidence: blob `17e5c0ef92fe2c1f53c221309b5bfd0eb5af53f4`; 2561 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0046 `apps/api-gateway/src/request-context.middleware.ts`
- Baseline evidence: blob `fb41ac3b072305843a2e1731bff018db28e681b4`; 1861 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0047 `apps/api-gateway/src/social-research-api.module.ts`
- Baseline evidence: blob `8e60d30a4d3e08d89cef160bef692614d86f461d`; 401 bytes; exact repository path.
- Owner classification: `apps/api-gateway`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0048 `apps/delivery-service/src/delivery-attempt-dispatch-loop.ts`
- Baseline evidence: blob `874bf02f9ae12b08b4eedab4693c0aab8e86324e`; 6953 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0049 `apps/delivery-service/src/delivery-attempt-queue-drain-loop.ts`
- Baseline evidence: blob `d6dc14de8d16f47a7f725982b058be83bd5c42ba`; 6860 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0050 `apps/delivery-service/src/delivery-attempt-queue-reader.ts`
- Baseline evidence: blob `b74b547357784e8792e728213c47d9dc987c7f5a`; 1389 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0051 `apps/delivery-service/src/delivery-service-provider-tokens.ts`
- Baseline evidence: blob `43f36dbb8d25c758a02456ec7b548e4b3d40781f`; 13734 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0052 `apps/delivery-service/src/delivery-service.module.ts`
- Baseline evidence: blob `ebead609543d603efb765f0904df9618126b6a49`; 16376 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0053 `apps/delivery-service/src/digest-scheduler-loop.ts`
- Baseline evidence: blob `34175f5d93209fe37a1fe581d1b402523c11aa34`; 3636 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0054 `apps/delivery-service/src/main.ts`
- Baseline evidence: blob `ef7fd87f10b82a23fa4338338d385693c6bea34e`; 477 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0055 `apps/delivery-service/src/summary-ready-event-drain-loop.ts`
- Baseline evidence: blob `3da011170bc7c5fb6c9bcc2e0802800af497fa12`; 6912 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0056 `apps/delivery-service/src/summary-ready-event-queue-reader.ts`
- Baseline evidence: blob `14ccec0cf3d1da0c1b425a3b1b4c834a624f03f2`; 4408 bytes; exact repository path.
- Owner classification: `apps/delivery-service`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0057 `apps/event-relay/src/event-relay-provider-tokens.ts`
- Baseline evidence: blob `0a78e7791655466e0824195cf6091149329d8ebb`; 2774 bytes; exact repository path.
- Owner classification: `apps/event-relay`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0058 `apps/event-relay/src/event-relay.module.ts`
- Baseline evidence: blob `0edd72f8174616fa783417b90c859bbcfd22ff90`; 4749 bytes; exact repository path.
- Owner classification: `apps/event-relay`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0059 `apps/event-relay/src/main.ts`
- Baseline evidence: blob `58cac2054c0d98b55897cfec939569bed2695fc1`; 457 bytes; exact repository path.
- Owner classification: `apps/event-relay`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0060 `apps/event-relay/src/outbox-relay-loop.ts`
- Baseline evidence: blob `f943cedbc24189962cc3777614c6bcf1a691f32b`; 2873 bytes; exact repository path.
- Owner classification: `apps/event-relay`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0061 `apps/event-relay/src/scan-command-relay-loop.ts`
- Baseline evidence: blob `22451b465a38280be1118c5064259d9084477c9b`; 2989 bytes; exact repository path.
- Owner classification: `apps/event-relay`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0062 `apps/ingestion-worker/src/adapters/composition/ingestion-worker-runtime.providers.ts`
- Baseline evidence: blob `f1b5b4dfe0619837bf7942fa9c41e0290e360b10`; 3785 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0063 `apps/ingestion-worker/src/adapters/composition/ingestion-worker-storage.providers.ts`
- Baseline evidence: blob `1502a68a5a0419fc7de6410c1287bb9f7ff46a3c`; 10458 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0064 `apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter.ts`
- Baseline evidence: blob `123daab324f50905e66b594404858fe652efd946`; 4051 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0065 `apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection.ts`
- Baseline evidence: blob `6dbf933aea91b5ce854160226555bbd924396d74`; 6092 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0066 `apps/ingestion-worker/src/article-content-enrichment.module.ts`
- Baseline evidence: blob `74678573f79d5a7208b745d7551bb497757e5774`; 764 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0067 `apps/ingestion-worker/src/execute-scan.module.ts`
- Baseline evidence: blob `9a281d8d6dc388a4371f28a69a1e86b70da5f0f1`; 3085 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0068 `apps/ingestion-worker/src/github-repo-radar.module.ts`
- Baseline evidence: blob `fec476dd3942eff2c07342b2c004350d885b5e20`; 2501 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0069 `apps/ingestion-worker/src/ingestion-worker-provider-tokens.ts`
- Baseline evidence: blob `64a67aa1451d72d55fc1e4ca43441dc3f2da4d1c`; 11292 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0070 `apps/ingestion-worker/src/ingestion-worker.module.ts`
- Baseline evidence: blob `e94bc1469c0694f40b1522adeee0544efe148fad`; 8792 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0071 `apps/ingestion-worker/src/main.ts`
- Baseline evidence: blob `c71293c5503a8b88260c66f669a98325c8574cf6`; 477 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0072 `apps/ingestion-worker/src/reddit-conversation-summary-flow.e2e-spec.ts`
- Baseline evidence: blob `078f18d4dbdf1924550b992d6c01206fd9a51150`; 9024 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0073 `apps/ingestion-worker/src/scan-command-queue-reader.ts`
- Baseline evidence: blob `16a1c60c11c992637ae24f7b155dd37b04609298`; 1333 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0074 `apps/ingestion-worker/src/scan-delivery-settlement-policy.ts`
- Baseline evidence: blob `9e9fd412dc7b4af53441a15768bf72271d7d6f00`; 1076 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0075 `apps/ingestion-worker/src/scan-queue-drain-loop.ts`
- Baseline evidence: blob `a250d47257fb5e0e51223677001b6a757e0bd75f`; 9472 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0076 `apps/ingestion-worker/src/scan-retry-delivery-batch.ts`
- Baseline evidence: blob `cb2e18adc29e60fe83de807399cd4b852c999cc2`; 3599 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0077 `apps/ingestion-worker/src/scan-scheduler-loop.ts`
- Baseline evidence: blob `901e03c93bfe4a41aeca1a7da1d2d4591af1db58`; 4130 bytes; exact repository path.
- Owner classification: `apps/ingestion-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0078 `apps/intelligence-worker/src/auto-summary-scheduler-loop.ts`
- Baseline evidence: blob `8eb675bfdb2f5b7e202f8bfbad6bc63fe8603909`; 4182 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0079 `apps/intelligence-worker/src/intelligence-summary-queue-names.ts`
- Baseline evidence: blob `faede1c92a58a80d336e79069148ae47d4beb57d`; 667 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0080 `apps/intelligence-worker/src/intelligence-worker-provider-tokens.ts`
- Baseline evidence: blob `b45f9a6d1c90bd490ba58d61255544ab1ae8b9ec`; 14772 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0081 `apps/intelligence-worker/src/intelligence-worker.module.ts`
- Baseline evidence: blob `6193d47de92bfca25f23c9e2566f8064491f9c07`; 11246 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0082 `apps/intelligence-worker/src/main.ts`
- Baseline evidence: blob `843f4388b06ab46ad4db89d602c93676430406af`; 489 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0083 `apps/intelligence-worker/src/periodic-reader-summary-scheduler-loop.ts`
- Baseline evidence: blob `e940091be1dd8a8d455017f42ec21dbff39ee3f2`; 5341 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0084 `apps/intelligence-worker/src/periodic-reader-summary-scheduler-options.ts`
- Baseline evidence: blob `cb415f960ecfe522e0660bce2ed5048f619f2ea2`; 3406 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0085 `apps/intelligence-worker/src/reader-summary-job-polling-loop.ts`
- Baseline evidence: blob `f17a8af8900286d063d2dcd1062486ec75230935`; 6095 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0086 `apps/intelligence-worker/src/reader-summary-job-queue-drain-loop.ts`
- Baseline evidence: blob `0afeecdad159268c6a50c8845001faf7e3bad5d1`; 7301 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0087 `apps/intelligence-worker/src/reader-value-cleanup-loop.ts`
- Baseline evidence: blob `f409f935875e72964fa58d9b245895bd7b17392b`; 2290 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0088 `apps/intelligence-worker/src/reader-value-provider-tokens.ts`
- Baseline evidence: blob `221f35c35e7d889fbdc660655474f35e878cc1ef`; 1718 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0089 `apps/intelligence-worker/src/reader-value-runtime-options.ts`
- Baseline evidence: blob `27cb8a4109f3689158fed0b874ced09a81bdafed`; 5349 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0090 `apps/intelligence-worker/src/reader-value-scoring-loop.ts`
- Baseline evidence: blob `bfc820e70c0e99180afe7cc02df142ea3e3b448e`; 1632 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0091 `apps/intelligence-worker/src/reader-value.module.ts`
- Baseline evidence: blob `03453d33f7e37a6b2499ea16a5cc3d8a316e2dac`; 4962 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0092 `apps/intelligence-worker/src/relevance-memory-projection-loop.ts`
- Baseline evidence: blob `9f34013ba1338a167aca9bc82e2944902ed402bb`; 3506 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0093 `apps/intelligence-worker/src/summary-job-polling-loop.ts`
- Baseline evidence: blob `52ed792ebe93fed405056856462bb031691246de`; 4873 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0094 `apps/intelligence-worker/src/summary-job-queue-drain-loop.ts`
- Baseline evidence: blob `91817543a493aa973dd195cdb896d57593e8b759`; 6965 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0095 `apps/intelligence-worker/src/summary-job-queue-reader.ts`
- Baseline evidence: blob `11d15c517d804ef92e819ebc207cb973d8071279`; 1488 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0096 `apps/intelligence-worker/src/worker-shutdown-marker.ts`
- Baseline evidence: blob `7c06c66d780cebf7ce0bc713536da94d68c6fa39`; 773 bytes; exact repository path.
- Owner classification: `apps/intelligence-worker`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0097 `apps/social-research-grpc/src/main.ts`
- Baseline evidence: blob `ebf8deb7592101682d1c8932ef03e6aa9d7ee99a`; 1554 bytes; exact repository path.
- Owner classification: `apps/social-research-grpc`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0098 `apps/social-research-grpc/src/social-research-grpc-runtime.module.ts`
- Baseline evidence: blob `bdfba933d94bbbbbdddd73a8bb417eb86f9e8baa`; 486 bytes; exact repository path.
- Owner classification: `apps/social-research-grpc`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0099 `apps/social-research-grpc/src/social-research-grpc-runtime.ts`
- Baseline evidence: blob `63c7f401803d9ff916563d28973011f4eee36cdb`; 3604 bytes; exact repository path.
- Owner classification: `apps/social-research-grpc`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0100 `apps/social-research-grpc/src/social-research-grpc-server.ts`
- Baseline evidence: blob `e8f22de3fbf662b623c25d2efb450718336653b0`; 811 bytes; exact repository path.
- Owner classification: `apps/social-research-grpc`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0101 `apps/social-research-grpc/src/social-research-grpc-settings.ts`
- Baseline evidence: blob `976b05f2221ebb7eeb0545718e0b82cc5fa1bf9a`; 802 bytes; exact repository path.
- Owner classification: `apps/social-research-grpc`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0102 `apps/social-research-mcp/src/main.ts`
- Baseline evidence: blob `5e845a076cade99bcf703bc432b06ee45cf478ef`; 1206 bytes; exact repository path.
- Owner classification: `apps/social-research-mcp`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0103 `apps/social-research-mcp/src/social-research-mcp-runtime.module.ts`
- Baseline evidence: blob `2b58ba92198176147855bfe5644cfc8f053e1564`; 484 bytes; exact repository path.
- Owner classification: `apps/social-research-mcp`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0104 `apps/social-research-mcp/src/social-research-mcp-runtime.ts`
- Baseline evidence: blob `3092bc39c19d247bfe33d3cb248533e7db2c6c88`; 1853 bytes; exact repository path.
- Owner classification: `apps/social-research-mcp`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0105 `apps/social-research-mcp/src/social-research-mcp-server.ts`
- Baseline evidence: blob `723c8fe1e4c04b45b07125f3f2643ca0f2f080d8`; 3665 bytes; exact repository path.
- Owner classification: `apps/social-research-mcp`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0106 `apps/social-research-runtime/src/social-research-runtime-settings.ts`
- Baseline evidence: blob `2d3132fece74bf949675c91be3c89d774212e04b`; 5609 bytes; exact repository path.
- Owner classification: `apps/social-research-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0107 `apps/social-research-runtime/src/social-research-runtime.module.ts`
- Baseline evidence: blob `441423898b96cf4bd0eb9b9f520b869793f5ea4b`; 6610 bytes; exact repository path.
- Owner classification: `apps/social-research-runtime`; tentative role: composition/executable; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: startup/DI, lifecycle, authorized transport E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0108 `libs/contracts/events/webhook-events.ts`
- Baseline evidence: blob `54c2cbcafb173ab48051fb20f9f61d56c987b995`; 688 bytes; exact repository path.
- Owner classification: `libs/contracts`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0109 `libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts`
- Baseline evidence: blob `1854a6ef0b48fdaed338ea8121aaed3610f5a97f`; 6989 bytes; exact repository path.
- Owner classification: `libs/contracts`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0110 `libs/conversation/adapters/ingestion/conversation-unit-projection.adapter.ts`
- Baseline evidence: blob `09067df82ec598f400f140be597256486d4b9113`; 5493 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0111 `libs/conversation/adapters/persistence/in-memory-conversation-unit.repository.ts`
- Baseline evidence: blob `019995c7cc8d89579ba2930804a3b08a1b9c9eef`; 5888 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0112 `libs/conversation/adapters/persistence/prisma/prisma-conversation-records.ts`
- Baseline evidence: blob `91465b772fc5c5c47c90ec2a81246a94db0ca8df`; 2057 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0113 `libs/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository.ts`
- Baseline evidence: blob `9be8311dd21296c71cf0ff17491d8304efefb111`; 11518 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0114 `libs/conversation/domain/entities/conversation-unit.ts`
- Baseline evidence: blob `12470f47d0930ab98006b9afc6db4cf2d744b8c1`; 3206 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0115 `libs/conversation/domain/index.ts`
- Baseline evidence: blob `613012442197ab03d95fa70eeb8166463b61cfab`; 235 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0116 `libs/conversation/domain/services/conversation-bundle-builder.ts`
- Baseline evidence: blob `413ef41d35ee1754fff94fb031afe1b0fe4721b7`; 7958 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0117 `libs/conversation/domain/value-objects/conversation-signal-baseline-sample.ts`
- Baseline evidence: blob `c6e3f905d37a3dcb6d1eaedee6ce80777be7f0f3`; 1296 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0118 `libs/conversation/domain/value-objects/conversation-unit-content-hash.ts`
- Baseline evidence: blob `fe1154baa759e8ea853566bfc3d16103bd097d17`; 549 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0119 `libs/conversation/index.ts`
- Baseline evidence: blob `674632e9dc7cfab3b5c7d67a92c39434696b594c`; 51 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0120 `libs/conversation/ports/conversation-signal-baseline-repository.port.ts`
- Baseline evidence: blob `e93867b95a8a12c5272d30710014c7540fb4b46c`; 972 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0121 `libs/conversation/ports/conversation-unit-repository.port.ts`
- Baseline evidence: blob `1f3bba9ea5e434ae4a664a20352dcf26beb1b8c8`; 1177 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0122 `libs/conversation/ports/index.ts`
- Baseline evidence: blob `1765066ee561e4db1f08086e011836954a4976ed`; 117 bytes; exact repository path.
- Owner classification: `libs/conversation`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0123 `libs/delivery/adapters/events/contract-webhook-event-catalog.adapter.ts`
- Baseline evidence: blob `75b8a6b6be3b7449a038c8cfe1abbb1a77eece1e`; 427 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0124 `libs/delivery/adapters/messaging/in-memory-delivery-attempt-dispatch-queue.adapter.ts`
- Baseline evidence: blob `d709a32a0b7869f088d959a1786a5c5cbdecc681`; 3036 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0125 `libs/delivery/adapters/notification/circuit-breaker-delivery.provider.ts`
- Baseline evidence: blob `653c8e9c434912987e83d5ac15a899034ff09c6d`; 2003 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0126 `libs/delivery/adapters/notification/guarded-webhook-http-client.ts`
- Baseline evidence: blob `54af5a06f9c79e46eda96fa7779368fdbbcf030f`; 3304 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0127 `libs/delivery/adapters/notification/http-webhook-delivery.provider.ts`
- Baseline evidence: blob `fa89da82f11113c9c2613eaed02d21fa20839777`; 6205 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0128 `libs/delivery/adapters/notification/in-memory-delivery.provider.ts`
- Baseline evidence: blob `b1af91e91afe46164ad6ecf965dafe2c88c1a61f`; 870 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0129 `libs/delivery/adapters/notification/metered-delivery.provider.ts`
- Baseline evidence: blob `028474050cf4e79cea943ed046113034dbd95d67`; 1380 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0130 `libs/delivery/adapters/persistence/in-memory-delivery-attempt.repository.ts`
- Baseline evidence: blob `457f58fdf264c5cbe9265c22dd6f209b110d6bf2`; 4293 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0131 `libs/delivery/adapters/persistence/in-memory-delivery-workflow.store.ts`
- Baseline evidence: blob `c0d6d66ef62212783303259ac488f6a9497cd5a4`; 8589 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0132 `libs/delivery/adapters/persistence/in-memory-digest-schedule.repository.ts`
- Baseline evidence: blob `bb265259c7efd7d1657bea5885abb7a5ad553593`; 3443 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0133 `libs/delivery/adapters/persistence/in-memory-digest.repository.ts`
- Baseline evidence: blob `f3507b457bc8b4abf8228de3c0fcf707bcf98673`; 1224 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0134 `libs/delivery/adapters/persistence/in-memory-reader-summary-ready-projection.store.ts`
- Baseline evidence: blob `b1fd0b123ea0642e8824c828108035e657eb0362`; 1822 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0135 `libs/delivery/adapters/persistence/in-memory-realtime-event.repository.ts`
- Baseline evidence: blob `549850ece495e81eed544df2c7d80272d593bc15`; 2424 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0136 `libs/delivery/adapters/persistence/in-memory-summary-ready-projection.store.ts`
- Baseline evidence: blob `81f12ae376fd11799fbbee479eb52c9cf6a5f4e6`; 1501 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0137 `libs/delivery/adapters/persistence/in-memory-webhook-endpoint.repository.ts`
- Baseline evidence: blob `5b49785d74ebe9a5c84752b6f2d96d8df3bc8ce5`; 2374 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0138 `libs/delivery/adapters/persistence/prisma/prisma-delivery-attempt.repository.ts`
- Baseline evidence: blob `7a40e81a0900ba054a44586c8f0abbcec8befe7c`; 5827 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0139 `libs/delivery/adapters/persistence/prisma/prisma-delivery-client.ts`
- Baseline evidence: blob `f5621d81cacc69570784ac95699738f7bbc47892`; 12322 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0140 `libs/delivery/adapters/persistence/prisma/prisma-delivery-connection.ts`
- Baseline evidence: blob `eed34c05ffd0586b9c3c186eda4af5ea5c225cb2`; 3087 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0141 `libs/delivery/adapters/persistence/prisma/prisma-delivery-records.ts`
- Baseline evidence: blob `c5d0f731ad81d927eac722e8f64dc4403c0e64ac`; 16126 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0142 `libs/delivery/adapters/persistence/prisma/prisma-delivery-workflow-client.ts`
- Baseline evidence: blob `1867aba6090ecf00ff17e22e84cb9fbea5c7c397`; 2310 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0143 `libs/delivery/adapters/persistence/prisma/prisma-delivery-workflow.store.ts`
- Baseline evidence: blob `e8af52bf731631eb0c6fe5b993d84e90b8fd6224`; 7828 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0144 `libs/delivery/adapters/persistence/prisma/prisma-digest-schedule.repository.ts`
- Baseline evidence: blob `30c93fe8282bf4f23ea438eee360d186a1ddf26d`; 4263 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0145 `libs/delivery/adapters/persistence/prisma/prisma-digest.repository.ts`
- Baseline evidence: blob `a92f84a75e8129c80d37a3c419f60762fc6edaa0`; 2192 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0146 `libs/delivery/adapters/persistence/prisma/prisma-reader-summary-projection-client.ts`
- Baseline evidence: blob `f6aab7e5dd28ecd03b4d3228abd710813fe0449c`; 774 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0147 `libs/delivery/adapters/persistence/prisma/prisma-reader-summary-ready-projection.store.ts`
- Baseline evidence: blob `330b9b26de7fa064565fb81e5dbbbaf6cf697b5e`; 3585 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0148 `libs/delivery/adapters/persistence/prisma/prisma-realtime-event.repository.ts`
- Baseline evidence: blob `cf2879e8bdeda3a9a2a2cb8a586a0094265074f8`; 3584 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0149 `libs/delivery/adapters/persistence/prisma/prisma-summary-ready-projection.store.ts`
- Baseline evidence: blob `d2a9e17377f7a0eea91c26f80c9f7dd140bbd04f`; 3363 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0150 `libs/delivery/adapters/persistence/prisma/prisma-webhook-endpoint.repository.ts`
- Baseline evidence: blob `6c211f17165dd988b9cc3eb9b49bc9fa8a984ce5`; 3181 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0151 `libs/delivery/adapters/persistence/reader-summary-projection-identity.ts`
- Baseline evidence: blob `2e0dc3d6a5b947fa2a795473cd421fa61b991cb7`; 1286 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0152 `libs/delivery/adapters/persistence/summary-ready-projection-identity.ts`
- Baseline evidence: blob `401912e9e27512816ff34b39775f2de75c4718fa`; 2071 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0153 `libs/delivery/adapters/preferences/in-memory-notification-preference.reader.ts`
- Baseline evidence: blob `ecda1b24b0c8355b255004341af165b9dda19d63`; 3047 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0154 `libs/delivery/adapters/preferences/prisma/prisma-notification-preference.reader.ts`
- Baseline evidence: blob `f00069382278cf5dca06de6f8e26e2ea0ce96e11`; 4752 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0155 `libs/delivery/adapters/replay/in-memory-webhook-replay.store.ts`
- Baseline evidence: blob `8776c7f4e4cd24c697cc166082d9cfe0febdf302`; 675 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0156 `libs/delivery/adapters/replay/prisma/prisma-webhook-replay.store.ts`
- Baseline evidence: blob `010741fabbe51bb9a4df1273f3486d72e8080015`; 1837 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0157 `libs/delivery/adapters/secrets/in-memory-webhook-secret.vault.ts`
- Baseline evidence: blob `a810d8fea122749dfde9da781ade9273fb8cd27e`; 1138 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0158 `libs/delivery/adapters/secrets/prisma/prisma-webhook-secret.vault.ts`
- Baseline evidence: blob `266d5a1bac7d2bb46ebf156ed36f3394c541778d`; 3750 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0159 `libs/delivery/adapters/source/in-memory-digest-source.reader.ts`
- Baseline evidence: blob `1b39f30512d869a5efca2e667d8492d2e46ddf88`; 1762 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0160 `libs/delivery/adapters/source/prisma/prisma-digest-source.reader.ts`
- Baseline evidence: blob `bd331a9b233dc0d041f2b7315bc794ad194cc734`; 5022 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0161 `libs/delivery/application/contracts/delivery-attempt-workflow.ts`
- Baseline evidence: blob `94a833dd421337baf3b2a5c86fd19ccd0be2e61c`; 2682 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0162 `libs/delivery/application/contracts/reader-summary-ready-projection-store.ts`
- Baseline evidence: blob `5456f9c173fd6e1541f32053f3f85dfd671b1652`; 726 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0163 `libs/delivery/application/contracts/summary-ready-projection-store.ts`
- Baseline evidence: blob `a457d3c004d0c9e38334605cc12e3434736666eb`; 720 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0164 `libs/delivery/application/delivery-workflow-transitions.ts`
- Baseline evidence: blob `353df6145e2f3e5f8a6f5f2edc8833cc5829811b`; 4927 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0165 `libs/delivery/domain/delivery-channel-policy.ts`
- Baseline evidence: blob `1c7ceb252086a7d8419af4ebb3510ea0dc70a761`; 555 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0166 `libs/delivery/domain/entities/delivery-attempt.ts`
- Baseline evidence: blob `f04b8476a7dbfaa8ac4c305d0cec003eb2403028`; 8007 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0167 `libs/delivery/domain/entities/digest-schedule.ts`
- Baseline evidence: blob `50c7234b6acc3458802fc7444b1be2e06e8de4af`; 2017 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0168 `libs/delivery/domain/entities/digest.ts`
- Baseline evidence: blob `2c27a120b6ddce5a99adf47c592b5eaac9ef1c9c`; 2763 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0169 `libs/delivery/domain/entities/realtime-event.ts`
- Baseline evidence: blob `b9bc992f30a116aeb3184e9f28d7545ae4673a16`; 1910 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0170 `libs/delivery/domain/entities/webhook-endpoint.ts`
- Baseline evidence: blob `bd3a0b03c139e6aea8e3e33454eb858145d5930f`; 3592 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0171 `libs/delivery/domain/index.ts`
- Baseline evidence: blob `356735974a3a62da9caacdb2fc13e671773ef107`; 297 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0172 `libs/delivery/domain/reader-summary-ready-projection.ts`
- Baseline evidence: blob `759e053c779a56b331f0b1005fd1293189443f14`; 1790 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0173 `libs/delivery/domain/realtime-replay-cursor.ts`
- Baseline evidence: blob `40269f51d2e84df643c709d7e4601a8fff70c12c`; 811 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0174 `libs/delivery/features/apply-delivery-suppression/apply-delivery-suppression.command.ts`
- Baseline evidence: blob `d43cc7cfc4c4207a3801785f925159f55c60479f`; 522 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0175 `libs/delivery/features/apply-delivery-suppression/apply-delivery-suppression.result.ts`
- Baseline evidence: blob `e39bac2a10d74d21623e1f3f0a2dfea87e2d762b`; 205 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0176 `libs/delivery/features/apply-delivery-suppression/apply-delivery-suppression.use-case.ts`
- Baseline evidence: blob `347727ec4a0338738c58334870323b4880b447d3`; 2116 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0177 `libs/delivery/features/assemble-digest/assemble-digest.command.ts`
- Baseline evidence: blob `7b5b0b80c1a96e94ee1dddbde7988189a21d4be4`; 488 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0178 `libs/delivery/features/assemble-digest/assemble-digest.result.ts`
- Baseline evidence: blob `174d675d242dc24b8ea1bfcf32627601ab418799`; 202 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0179 `libs/delivery/features/assemble-digest/assemble-digest.use-case.ts`
- Baseline evidence: blob `cbac3c264260c8ecd9d3c25ff9a329d17385e7c7`; 6550 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0180 `libs/delivery/features/create-digest-schedule/create-digest-schedule.command.ts`
- Baseline evidence: blob `e3c570e6bb87c959af11cda6c2749510e8510e0a`; 461 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0181 `libs/delivery/features/create-digest-schedule/create-digest-schedule.result.ts`
- Baseline evidence: blob `5cc8c10aece348706dc443d00dfc628bf3bf93ce`; 193 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0182 `libs/delivery/features/create-digest-schedule/create-digest-schedule.use-case.ts`
- Baseline evidence: blob `6a57ce38e824c1470015f3821c58f4600a6ea53a`; 2849 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0183 `libs/delivery/features/create-webhook-endpoint/create-webhook-endpoint.command.ts`
- Baseline evidence: blob `a04621f3edbd2cd1c5065332f663bdea943acc2d`; 259 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0184 `libs/delivery/features/create-webhook-endpoint/create-webhook-endpoint.result.ts`
- Baseline evidence: blob `520d4fb4c3573c4a856092e89c3ec04336707a9e`; 205 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0185 `libs/delivery/features/create-webhook-endpoint/create-webhook-endpoint.use-case.ts`
- Baseline evidence: blob `0aacff3a303925e4570c7dd00007fa866b2702f7`; 2799 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0186 `libs/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.command.ts`
- Baseline evidence: blob `5adfb3db71c9bf39ec02c1beff10babea169cfaf`; 232 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0187 `libs/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.result.ts`
- Baseline evidence: blob `fbf63003abfd2e857c8909547f35e7e2154e94ac`; 146 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0188 `libs/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.use-case.ts`
- Baseline evidence: blob `f01d4158587fc0be1e6f4cc9c34896d0259ea67f`; 1362 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0189 `libs/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.command.ts`
- Baseline evidence: blob `d92de5ad0f6e8f6b4bacb7918c236e6716c4d885`; 307 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0190 `libs/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.result.ts`
- Baseline evidence: blob `2bc3881a0eaff957fcc6656695833906178aa932`; 285 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0191 `libs/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.use-case.ts`
- Baseline evidence: blob `b72cce40809db5b3c5a695fb9feaa9e995503d80`; 1897 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0192 `libs/delivery/features/get-delivery-attempt/get-delivery-attempt.query.ts`
- Baseline evidence: blob `7a45e1337127b76fba563066ecc41a196ac2ecd1`; 226 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0193 `libs/delivery/features/get-delivery-attempt/get-delivery-attempt.result.ts`
- Baseline evidence: blob `982339abfb9223efe1e7899b02059fb4b47aa4e8`; 142 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0194 `libs/delivery/features/get-delivery-attempt/get-delivery-attempt.use-case.ts`
- Baseline evidence: blob `3f00755a40d04d466d16f41bebfdc5aa9401097a`; 1142 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0195 `libs/delivery/features/get-digest-schedule/get-digest-schedule.query.ts`
- Baseline evidence: blob `62745ee9c99d4f6efcfcdb41c3fe45a7f0a7d96f`; 224 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0196 `libs/delivery/features/get-digest-schedule/get-digest-schedule.result.ts`
- Baseline evidence: blob `1222d8fd384760d2d10dec64f91ec567d46a6694`; 138 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0197 `libs/delivery/features/get-digest-schedule/get-digest-schedule.use-case.ts`
- Baseline evidence: blob `3a96ed55adf4e9e21e46ff0e5ee48d4cbeb33dca`; 1112 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0198 `libs/delivery/features/get-digest/get-digest.query.ts`
- Baseline evidence: blob `b247b1402029bd6f7137ed72e5307de57ac7394c`; 208 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0199 `libs/delivery/features/get-digest/get-digest.result.ts`
- Baseline evidence: blob `794de63792407c99771b1ebe51987d53f385168c`; 105 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0200 `libs/delivery/features/get-digest/get-digest.use-case.ts`
- Baseline evidence: blob `3dc08d4e95e64c89019d7c72a483480a26105d29`; 945 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0201 `libs/delivery/features/get-notification-preference/get-notification-preference.query.ts`
- Baseline evidence: blob `62021e9cda1e192c9344f15141ef82c8a2709a23`; 319 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0202 `libs/delivery/features/get-notification-preference/get-notification-preference.result.ts`
- Baseline evidence: blob `7a31cd52f35003e9fb99a9cd7f7bdbc829f88a97`; 170 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0203 `libs/delivery/features/get-notification-preference/get-notification-preference.use-case.ts`
- Baseline evidence: blob `66577af7403ba166c6bb4d43a2117b568c78897a`; 1948 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0204 `libs/delivery/features/get-webhook-endpoint/get-webhook-endpoint.query.ts`
- Baseline evidence: blob `7320911c29ef44a680fc9f93df3ab2b047204d53`; 226 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0205 `libs/delivery/features/get-webhook-endpoint/get-webhook-endpoint.result.ts`
- Baseline evidence: blob `55448c58d8c9b3f2e9ec5041d09db0f903887e95`; 142 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0206 `libs/delivery/features/get-webhook-endpoint/get-webhook-endpoint.use-case.ts`
- Baseline evidence: blob `7959e055722d53263f0584c43db0352bb0458849`; 1131 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0207 `libs/delivery/features/get-workspace-settings/get-workspace-settings.query.ts`
- Baseline evidence: blob `d1fe881206b873b00c6c048f6192e44b7868bd7f`; 190 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0208 `libs/delivery/features/get-workspace-settings/get-workspace-settings.result.ts`
- Baseline evidence: blob `aa3a05a53c5cd3b238366bebe7e39f8827c33d62`; 172 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0209 `libs/delivery/features/get-workspace-settings/get-workspace-settings.use-case.ts`
- Baseline evidence: blob `be5a94b4eae4ad9ffd98a3635afa5ff4d9b926b8`; 857 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0210 `libs/delivery/features/list-delivery-attempts/list-delivery-attempts.query.ts`
- Baseline evidence: blob `4836d61c57d0ef4ae81d130c7cd04a77093d547e`; 244 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0211 `libs/delivery/features/list-delivery-attempts/list-delivery-attempts.result.ts`
- Baseline evidence: blob `ca54ee5f883be18675f3ffe1032c541f484a61b5`; 213 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0212 `libs/delivery/features/list-delivery-attempts/list-delivery-attempts.use-case.ts`
- Baseline evidence: blob `a6e2133b14880b98fbb731833f307f5cd4c4dadd`; 1096 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0213 `libs/delivery/features/list-digest-schedules/list-digest-schedules.query.ts`
- Baseline evidence: blob `100d40b85764bacac7ed0f896552aefaf2aebc4e`; 243 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0214 `libs/delivery/features/list-digest-schedules/list-digest-schedules.result.ts`
- Baseline evidence: blob `42bd4a7a587845e791a672741216644a949d7ae3`; 210 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0215 `libs/delivery/features/list-digest-schedules/list-digest-schedules.use-case.ts`
- Baseline evidence: blob `104b63f136c1c8993703183066215037035f1290`; 1069 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0216 `libs/delivery/features/list-realtime-events/list-realtime-events.query.ts`
- Baseline evidence: blob `6de980e114c036a148c7abb3bae21368c8fd4070`; 277 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0217 `libs/delivery/features/list-realtime-events/list-realtime-events.result.ts`
- Baseline evidence: blob `8fb045908b9acbceb8a45bf012083b9c818fcec2`; 691 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0218 `libs/delivery/features/list-realtime-events/list-realtime-events.use-case.ts`
- Baseline evidence: blob `13dc5c34b5822fb341909e09c266788e5f06de48`; 1544 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0219 `libs/delivery/features/list-webhook-endpoints/list-webhook-endpoints.query.ts`
- Baseline evidence: blob `0a81848c34ec635542a8557fbca8d807d9f0c34c`; 244 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0220 `libs/delivery/features/list-webhook-endpoints/list-webhook-endpoints.result.ts`
- Baseline evidence: blob `f9952ace8124c0e15a66031c9a23aa6c4eb4671b`; 214 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0221 `libs/delivery/features/list-webhook-endpoints/list-webhook-endpoints.use-case.ts`
- Baseline evidence: blob `2ba60d8c0d72f29d7d809eb5bcad22fcd7817540`; 1084 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0222 `libs/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case.ts`
- Baseline evidence: blob `057f570c8360f490e89528b02d98d768235870c2`; 2274 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0223 `libs/delivery/features/project-summary-ready-event/project-summary-ready-event.command.ts`
- Baseline evidence: blob `056f1f5491eea48818d92d81ce31ad98b8ef1e29`; 529 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0224 `libs/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case.ts`
- Baseline evidence: blob `c6dfae27d18ff910b3eca1574d6c2d32c3ffb88e`; 3984 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0225 `libs/delivery/features/quarantine-webhook-endpoint/quarantine-webhook-endpoint.command.ts`
- Baseline evidence: blob `7b28d6a544619f622725c5d8dabd7e99983c77d2`; 262 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0226 `libs/delivery/features/quarantine-webhook-endpoint/quarantine-webhook-endpoint.result.ts`
- Baseline evidence: blob `f200adb843567aa5f429944989ad665af1ae7567`; 149 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0227 `libs/delivery/features/quarantine-webhook-endpoint/quarantine-webhook-endpoint.use-case.ts`
- Baseline evidence: blob `e35e9d7ffeb725a33e5a1c77476a490a719170f7`; 1617 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0228 `libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.command.ts`
- Baseline evidence: blob `32c94336711ffcf7ff0c330084b760adc59d7384`; 479 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0229 `libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.result.ts`
- Baseline evidence: blob `8d35d1945ba93d5737002a4f89e2d9f32a24ab6e`; 212 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0230 `libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case.ts`
- Baseline evidence: blob `f012d00ce625cc96f789611931a2a4cd730a23fb`; 2612 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0231 `libs/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.command.ts`
- Baseline evidence: blob `d0a414b4cc6c9ecc1ff9638cc84b3dbcd2e30e27`; 386 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0232 `libs/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.result.ts`
- Baseline evidence: blob `e60fcf8eda27c993263f4badbf9c3e73f3a95be3`; 150 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0233 `libs/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.use-case.ts`
- Baseline evidence: blob `2f4e4ae4186da1e55222c804e0e372dc38141e72`; 2696 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0234 `libs/delivery/features/record-realtime-event/record-realtime-event.command.ts`
- Baseline evidence: blob `64fd19b6a348230af8a0a360c83e8f07c0f4b6c1`; 497 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0235 `libs/delivery/features/record-realtime-event/record-realtime-event.result.ts`
- Baseline evidence: blob `4a6e4fda7c231af1f83bddbd881f4f2f084000a5`; 135 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0236 `libs/delivery/features/record-realtime-event/record-realtime-event.use-case.ts`
- Baseline evidence: blob `be1de07d5e1831bf4a2dbed8f69336fc6c360b49`; 2781 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0237 `libs/delivery/features/retry-delivery-attempt/retry-delivery-attempt.command.ts`
- Baseline evidence: blob `77a9b6b1f2f1cbd62737ffd87b041b3bd19b2428`; 320 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0238 `libs/delivery/features/retry-delivery-attempt/retry-delivery-attempt.result.ts`
- Baseline evidence: blob `ccd4653fe37eef831a770afbe7271f96da69dbff`; 173 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0239 `libs/delivery/features/retry-delivery-attempt/retry-delivery-attempt.use-case.ts`
- Baseline evidence: blob `29dbab80e5cdd42f0b2967cc7f0d6bb98e2f6bdd`; 1712 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0240 `libs/delivery/features/schedule-due-digests/schedule-due-digests.command.ts`
- Baseline evidence: blob `42036419ace3664b07b025e91ec600a1c9b51141`; 218 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0241 `libs/delivery/features/schedule-due-digests/schedule-due-digests.result.ts`
- Baseline evidence: blob `c201493735632f43275b4a098a917d8a6c2624f4`; 398 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0242 `libs/delivery/features/schedule-due-digests/schedule-due-digests.use-case.ts`
- Baseline evidence: blob `22583f8e49f64281929d3cee22cb877695cae2a8`; 2565 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0243 `libs/delivery/features/send-delivery-attempt/delivery-execution-heartbeat.ts`
- Baseline evidence: blob `8cba27d54727a2e2af59cc0c9786c2247d183c29`; 1716 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0244 `libs/delivery/features/send-delivery-attempt/send-delivery-attempt.command.ts`
- Baseline evidence: blob `16e39eba02c2e945c75f8c4766697a4b8f6d60f5`; 358 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0245 `libs/delivery/features/send-delivery-attempt/send-delivery-attempt.result.ts`
- Baseline evidence: blob `b1e9d3375c620e540034059d470f5aa2975cdcf0`; 207 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0246 `libs/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case.ts`
- Baseline evidence: blob `29f47f6e5d1f71ba183045076f1cd519be7a3012`; 5153 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0247 `libs/delivery/features/set-notification-preference/set-notification-preference.command.ts`
- Baseline evidence: blob `d26a4a400a0ce875654aea40b069e114a21fad4b`; 378 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0248 `libs/delivery/features/set-notification-preference/set-notification-preference.result.ts`
- Baseline evidence: blob `8514fc310d891f6b41328e88b444e3a2289df7ad`; 224 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0249 `libs/delivery/features/set-notification-preference/set-notification-preference.use-case.ts`
- Baseline evidence: blob `b37f74906f72a3144bb8aae0b760b2b820d0de85`; 2503 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0250 `libs/delivery/features/shared/delivery-attempt-presenter.ts`
- Baseline evidence: blob `9e59a2ca17603458fb81c1625af7250838ab87e5`; 1145 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0251 `libs/delivery/features/shared/digest-presenter.ts`
- Baseline evidence: blob `77bc854ac85d3723d5b869730d53f3448a886d36`; 654 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0252 `libs/delivery/features/shared/digest-schedule-presenter.ts`
- Baseline evidence: blob `6b57c0070eb2c2adbd9fdaea40d686080b669b9f`; 494 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0253 `libs/delivery/features/shared/notification-preference-presenter.ts`
- Baseline evidence: blob `a9aa44fdc494e649ec102c77411aee0a9eb6bf22`; 304 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0254 `libs/delivery/features/shared/webhook-endpoint-presenter.ts`
- Baseline evidence: blob `a4d87c04e9180e5eb4090474435577b2f3f551e9`; 618 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0255 `libs/delivery/features/shared/workspace-settings-preferences.ts`
- Baseline evidence: blob `3fd75cbc24f340cd239e8686284994a1e37dc37b`; 5359 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0256 `libs/delivery/features/sign-webhook-payload/sign-webhook-payload.command.ts`
- Baseline evidence: blob `2f3bd4cd65320ed3080690a4377655e0e34a3f77`; 680 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0257 `libs/delivery/features/sign-webhook-payload/sign-webhook-payload.result.ts`
- Baseline evidence: blob `d93a5ed7de7fdaf29bbe616dc1e7af6dc511f51f`; 846 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0258 `libs/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case.ts`
- Baseline evidence: blob `4dc666bf2aed087d6d9982ca804d8db6a082ec79`; 3349 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0259 `libs/delivery/features/update-workspace-digest-preference/update-workspace-digest-preference.command.ts`
- Baseline evidence: blob `a15e61153a213ece6da06ed3011c0e303b155af5`; 233 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0260 `libs/delivery/features/update-workspace-digest-preference/update-workspace-digest-preference.result.ts`
- Baseline evidence: blob `ef7c1b1e6711d5d28adeca71f607126c92cf639b`; 215 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0261 `libs/delivery/features/update-workspace-digest-preference/update-workspace-digest-preference.use-case.ts`
- Baseline evidence: blob `931345257432c216892b59112fa33f743af3240f`; 1439 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0262 `libs/delivery/features/update-workspace-telemetry-consent/update-workspace-telemetry-consent.command.ts`
- Baseline evidence: blob `2785183a2decf0bb79d6c1352389e797eafe3963`; 231 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0263 `libs/delivery/features/update-workspace-telemetry-consent/update-workspace-telemetry-consent.result.ts`
- Baseline evidence: blob `862f46598e9fbc30240f3fe9111da237593dff6c`; 215 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0264 `libs/delivery/features/update-workspace-telemetry-consent/update-workspace-telemetry-consent.use-case.ts`
- Baseline evidence: blob `e9d95700905050472c169c4f8bcb0c849eb4a1e4`; 1436 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0265 `libs/delivery/features/verify-webhook-signature/verify-webhook-signature.command.ts`
- Baseline evidence: blob `09a898f9fe0cae2fd80c58be65a87f0bf232f5fa`; 420 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0266 `libs/delivery/features/verify-webhook-signature/verify-webhook-signature.result.ts`
- Baseline evidence: blob `b47621ba8a7751b15ce84c89d5476443d4412f7b`; 184 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0267 `libs/delivery/features/verify-webhook-signature/verify-webhook-signature.use-case.ts`
- Baseline evidence: blob `75849c64e357055d163d39d780219c713447feae`; 3435 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0268 `libs/delivery/interfaces/events/project-reader-summary-ready-event.handler.ts`
- Baseline evidence: blob `40df617c9a57aceedaac8bbd38fd3dde7760f89a`; 1728 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0269 `libs/delivery/interfaces/events/project-summary-ready-event.handler.ts`
- Baseline evidence: blob `c99f863c047a4a8cda8ec6a8ffc77f6133bb1af5`; 6991 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0270 `libs/delivery/interfaces/events/reader-summary-ready-event.parser.ts`
- Baseline evidence: blob `283254476402b7eeb6da977b59a151068613be1f`; 3404 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0271 `libs/delivery/interfaces/events/summary-ready-event.dispatcher.ts`
- Baseline evidence: blob `3dcf21cbdb76cbf0b0e49d40d90d2c637ffd3a92`; 862 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0272 `libs/delivery/interfaces/queue/schedule-due-digests-command.handler.ts`
- Baseline evidence: blob `b0a2e15b96a64926ba4d85ae93e8a3c12eaf184f`; 5309 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0273 `libs/delivery/interfaces/queue/send-delivery-attempt-command.handler.ts`
- Baseline evidence: blob `725dc3a548236e8d395e44244844f7f982f6b10b`; 6529 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0274 `libs/delivery/interfaces/rest/delivery-application.providers.ts`
- Baseline evidence: blob `98416c29ea5e6793c7c1603b5ce4defc6ca82855`; 10938 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0275 `libs/delivery/interfaces/rest/delivery-attempts.controller.ts`
- Baseline evidence: blob `7e5b520179e0274cafe54b523e8e4f984cc94947`; 6308 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0276 `libs/delivery/interfaces/rest/delivery-attempts.dto.ts`
- Baseline evidence: blob `0b1186c5e616d122e214487a064e7de8b4212252`; 1418 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0277 `libs/delivery/interfaces/rest/delivery-command-queue-options.ts`
- Baseline evidence: blob `67950511089b058fef95233315b01bb9d7eab6e5`; 1029 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0278 `libs/delivery/interfaces/rest/delivery-provider-factory.ts`
- Baseline evidence: blob `e1be8bc36835e7003c6d8080285ca0128c586ecd`; 3103 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0279 `libs/delivery/interfaces/rest/delivery-provider-tokens.ts`
- Baseline evidence: blob `2c88fa1a1d1f2956971fd3fb9ea94700fbf6eb51`; 5876 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0280 `libs/delivery/interfaces/rest/delivery-read.authorizer.ts`
- Baseline evidence: blob `942f84ce44c5da179cd73ddca159e1af27eca57a`; 2089 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0281 `libs/delivery/interfaces/rest/delivery-rest.module.ts`
- Baseline evidence: blob `7f4632f7153dc6f90032deef7a2267121f6fa91a`; 9192 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0282 `libs/delivery/interfaces/rest/delivery-storage.providers.ts`
- Baseline evidence: blob `3c067a98e0de2f33a70308a9589adbe1c73077ab`; 8282 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0283 `libs/delivery/interfaces/rest/delivery-webhook.providers.ts`
- Baseline evidence: blob `17984152b721a927dc9e8b5b51d48438bb9f0ef1`; 6130 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0284 `libs/delivery/interfaces/rest/delivery-workflow.providers.ts`
- Baseline evidence: blob `98672231b8ecddd095f827e9c37f4cd250327eda`; 2316 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0285 `libs/delivery/interfaces/rest/digest-schedules.controller.ts`
- Baseline evidence: blob `f6c63e09d30296daeadda2a346366f43d2796dc9`; 6554 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0286 `libs/delivery/interfaces/rest/digest-schedules.dto.ts`
- Baseline evidence: blob `7bf9058c93453fd42b3228bd025b0a6e6462c3d8`; 1501 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0287 `libs/delivery/interfaces/rest/digests.controller.ts`
- Baseline evidence: blob `3783d787508dedbd41c0ab39a2b4c3abffa49c2d`; 2129 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0288 `libs/delivery/interfaces/rest/digests.dto.ts`
- Baseline evidence: blob `d4336e40baee728127b1454230a0dd3446c20c05`; 137 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0289 `libs/delivery/interfaces/rest/notification-preferences.controller.ts`
- Baseline evidence: blob `4c2297d6a6beee77c229a4b97c5b25ceb7d54d8f`; 4457 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0290 `libs/delivery/interfaces/rest/notification-preferences.dto.ts`
- Baseline evidence: blob `0c9fda0de5420f964341c437db0d9a9f89ea8b6a`; 1049 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0291 `libs/delivery/interfaces/rest/realtime-events.controller.ts`
- Baseline evidence: blob `7958fd3cef4a178c82b373ec367203f371c6484a`; 2793 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0292 `libs/delivery/interfaces/rest/realtime-events.dto.ts`
- Baseline evidence: blob `f5f687c26e19b58d832a1d0ec5e1bb664007016f`; 184 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0293 `libs/delivery/interfaces/rest/webhook-endpoints.controller.ts`
- Baseline evidence: blob `07fe0eddf9e93db4b8a77a95cbf10c1d9615e5c7`; 14006 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0294 `libs/delivery/interfaces/rest/webhook-endpoints.dto.ts`
- Baseline evidence: blob `6a17d29d8d1a60c110cf37a9005c55c8ad4c0bfb`; 1236 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0295 `libs/delivery/interfaces/rest/workspace-settings.controller.ts`
- Baseline evidence: blob `96678ebe1caa60d441c3d51fbbe0ffabb7044b02`; 8420 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0296 `libs/delivery/interfaces/rest/workspace-settings.dto.ts`
- Baseline evidence: blob `1d940f334be6b8d9cd2e467f7a4e08fdedda1a4b`; 1410 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0297 `libs/delivery/interfaces/ws/realtime-events.gateway.ts`
- Baseline evidence: blob `81c3299d92361128873f9609fd830ac4864c40b9`; 7245 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0298 `libs/delivery/ports/delivery-attempt-dispatch-queue.port.ts`
- Baseline evidence: blob `edf7525299b44848fdeca7938c4a7715f5de61d9`; 663 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0299 `libs/delivery/ports/delivery-attempt-repository.port.ts`
- Baseline evidence: blob `6e52630587fc4085f1473eecc1bd43195de5838d`; 1279 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0300 `libs/delivery/ports/delivery-provider.port.ts`
- Baseline evidence: blob `e151fd125d22842b2940074e3d4e5f4cfa8a3598`; 771 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0301 `libs/delivery/ports/digest-repository.port.ts`
- Baseline evidence: blob `c3fcea55afb97cedbb06b6902ff75fea2c815479`; 505 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0302 `libs/delivery/ports/digest-schedule-repository.port.ts`
- Baseline evidence: blob `5a711f99a258bf283efe5abbc8e59481206f278b`; 1016 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0303 `libs/delivery/ports/digest-source-reader.port.ts`
- Baseline evidence: blob `3511a20b30cc216ba1ebfc2fa2f33ad1485f2a44`; 1130 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0304 `libs/delivery/ports/index.ts`
- Baseline evidence: blob `ecd2c616c278f7dfd6274106ab8c2bb0cf46a77f`; 680 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0305 `libs/delivery/ports/notification-preference-management.port.ts`
- Baseline evidence: blob `44ef8c39ff2ba2c207727ad09b3ac2261dd985ef`; 1212 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0306 `libs/delivery/ports/notification-preference-reader.port.ts`
- Baseline evidence: blob `d778f709bb43aedcaba6c794017cb2c499722d12`; 733 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0307 `libs/delivery/ports/realtime-event-repository.port.ts`
- Baseline evidence: blob `fa40abc19b45c56dcaa200e55c428c45b345e4ba`; 980 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0308 `libs/delivery/ports/realtime-fanout.port.ts`
- Baseline evidence: blob `4a9884377148e8f329a72b03639e70322be6e3b5`; 137 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0309 `libs/delivery/ports/webhook-endpoint-repository.port.ts`
- Baseline evidence: blob `bd02493b62b1a23429953916ffac8efa6e38e2ce`; 777 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0310 `libs/delivery/ports/webhook-event-catalog.port.ts`
- Baseline evidence: blob `c190fca4a9aa1cbcababeb90e198b83326a6e7dc`; 121 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0311 `libs/delivery/ports/webhook-replay-store.port.ts`
- Baseline evidence: blob `5e470f4daf1743fab1d5bd5c89f2f35927e22f06`; 224 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0312 `libs/delivery/ports/webhook-secret-vault.port.ts`
- Baseline evidence: blob `8336c9688b5a275bfaaa4cdfa77daf4f0b38ca7e`; 399 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0313 `libs/delivery/test-support/reader-summary-ready.fixture.ts`
- Baseline evidence: blob `819ef2c2f60ea47c07c33fb38f2e9570dd76b222`; 1306 bytes; exact repository path.
- Owner classification: `libs/delivery`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0314 `libs/feed/adapters/persistence/feed-dedupe-key.ts`
- Baseline evidence: blob `717fdf4c03d73e6335938d1ad715c72e39a7f10f`; 3563 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0315 `libs/feed/adapters/persistence/feed-item-query-filter.ts`
- Baseline evidence: blob `84184d09526f7c279f65a508122abe7ff39b3865`; 4136 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0316 `libs/feed/adapters/persistence/feed-projection-content.ts`
- Baseline evidence: blob `fe56c8e8a1055ebc975083d591c00f30c271209d`; 4567 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0317 `libs/feed/adapters/persistence/in-memory-feed-item-read.repository.ts`
- Baseline evidence: blob `5a103246c1c65fa766b839e10f66e7e635894f8c`; 15612 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0318 `libs/feed/adapters/persistence/prisma/prisma-feed-client.ts`
- Baseline evidence: blob `e52c84047faa3b17267a532cd2b0701da3b5f516`; 7810 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0319 `libs/feed/adapters/persistence/prisma/prisma-feed-collection-coverage.ts`
- Baseline evidence: blob `96f6f5c4ef27113f341b16bf80d62403a98430cc`; 5124 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0320 `libs/feed/adapters/persistence/prisma/prisma-feed-connection.ts`
- Baseline evidence: blob `bcecb6749fbe71bc2cf58269d0c91f8b675b62e5`; 2204 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0321 `libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository.ts`
- Baseline evidence: blob `29db7b7dfec156614b001cbabb5fdd71d9bd79e4`; 16182 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0322 `libs/feed/adapters/persistence/prisma/prisma-feed-projection.adapter.ts`
- Baseline evidence: blob `f3833ab126bbfc141187b7d8345fc379f39da7fe`; 10462 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0323 `libs/feed/adapters/persistence/prisma/prisma-feed-promotion-exact-evidence.ts`
- Baseline evidence: blob `7e38f530ec103e3da33609ab3df25278f532e3e3`; 12161 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0324 `libs/feed/adapters/persistence/prisma/prisma-feed-promotion-keyset.ts`
- Baseline evidence: blob `9b5b33b3c78caf96bdbb4e888b0958bca885d737`; 3008 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0325 `libs/feed/adapters/persistence/prisma/prisma-feed-records.ts`
- Baseline evidence: blob `52f52ab79f6d8f155f30c892a058a1425e50afac`; 2260 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0326 `libs/feed/adapters/persistence/prisma/prisma-feed-signal-baseline.repository.ts`
- Baseline evidence: blob `348264c61a69d9d0c81bc3d6481f19940763242a`; 5298 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0327 `libs/feed/adapters/persistence/prisma/prisma-source-engagement-client.ts`
- Baseline evidence: blob `52f0a18781d3e7e1cc0248a736b26b20870fb427`; 7736 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0328 `libs/feed/adapters/persistence/prisma/prisma-source-engagement-projection-helpers.ts`
- Baseline evidence: blob `4f13853f4ab8ab0e7be33a647cb1bb132d9f0cad`; 3958 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0329 `libs/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter.ts`
- Baseline evidence: blob `75f6bd4c88f03682a8597fc41c5840ab34b7002a`; 15984 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0330 `libs/feed/adapters/persistence/prisma/retained-promotion-authority-projection.ts`
- Baseline evidence: blob `676be6817f5ee13e653bfdf03a2b6d443b871903`; 2232 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0331 `libs/feed/domain/entities/feed-item.ts`
- Baseline evidence: blob `7b035956ffb65efaefb8e77fd5a7dd2953f66db7`; 1776 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0332 `libs/feed/domain/entities/feed-signal.ts`
- Baseline evidence: blob `1acdcf7930a1b4afa57de88d54067e7830a6e5c8`; 828 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0333 `libs/feed/domain/index.ts`
- Baseline evidence: blob `093305efd0f95908b9cb4675bcbdd425061acd80`; 623 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0334 `libs/feed/domain/policies/feed-promotion-eligibility.ts`
- Baseline evidence: blob `b771cad928bf71fd1715af7b0133654ca821a5b8`; 16205 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0335 `libs/feed/domain/policies/reader-promotion-engagement-authority.ts`
- Baseline evidence: blob `cc684ffa1e9bd1eb1dbdb57673eebf87490cefcf`; 3009 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0336 `libs/feed/domain/policies/reader-promotion-policy-v2.spec-fixtures.ts`
- Baseline evidence: blob `524020e7becb2a2c42efa6150691dda2983685b7`; 3193 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0337 `libs/feed/domain/policies/reader-promotion-policy-v2.ts`
- Baseline evidence: blob `655fe87b22bde78d3329ec15d02d92b813e32086`; 14309 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0338 `libs/feed/domain/services/cohort-baseline-content-signal-normalizer.ts`
- Baseline evidence: blob `e9b2eea2033e1c74fd935fc75401c7433f3324b1`; 11927 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0339 `libs/feed/domain/services/cohort-baseline-feed-signal-normalizer.ts`
- Baseline evidence: blob `aff93608c089ff7267c6b407bf2f66fe54e58db9`; 2592 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0340 `libs/feed/domain/value-objects/feed-github-provider-metrics.ts`
- Baseline evidence: blob `3b2f9f59b590a394f5d5b795da94dba0a57013d2`; 5804 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0341 `libs/feed/domain/value-objects/feed-normalized-signal.ts`
- Baseline evidence: blob `34e95676f9858e36d5aa70d2821ef976e10f76e5`; 700 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0342 `libs/feed/domain/value-objects/feed-promotion-metric-authority.ts`
- Baseline evidence: blob `fe6670b95f5897767ae1d769862c64076d097275`; 2873 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0343 `libs/feed/domain/value-objects/feed-provider-metric-labels.ts`
- Baseline evidence: blob `0e7b8ad389e1badb8963b54a593928527338c1eb`; 6643 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0344 `libs/feed/domain/value-objects/feed-provider-metrics.ts`
- Baseline evidence: blob `06d760adac3f50e8ebbc2fa6c0474949bc1cfc0b`; 13214 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0345 `libs/feed/domain/value-objects/feed-provider-source-keys.ts`
- Baseline evidence: blob `7b9ef47de68e244d43e0949fd72a18a94a6af2b9`; 3548 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0346 `libs/feed/domain/value-objects/feed-signal-baseline-sample.ts`
- Baseline evidence: blob `d600d16d702c0cbe02eb86cd89f74976c76189c6`; 1131 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0347 `libs/feed/domain/value-objects/reader-promotion-v2-candidate.ts`
- Baseline evidence: blob `ddb216e5ea31f354a51451ad620993ea87de93b4`; 6846 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0348 `libs/feed/domain/value-objects/retained-promotion-authority.ts`
- Baseline evidence: blob `f3161e1ed3e5cd5673d3d7e44ded741bbbcc4de2`; 2373 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0349 `libs/feed/features/get-feed-item/get-feed-item.query.ts`
- Baseline evidence: blob `600fd0d6390ea799ef9151051c10bb141da7579f`; 212 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0350 `libs/feed/features/get-feed-item/get-feed-item.result.ts`
- Baseline evidence: blob `9781fd22a633b4b7bce6df9b719b5d23c3c33c34`; 674 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0351 `libs/feed/features/get-feed-item/get-feed-item.use-case.ts`
- Baseline evidence: blob `942e9a3112715a65d9b6b286b0d36f643ac0c7d5`; 1869 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0352 `libs/feed/features/list-feed-items/list-feed-items.query.ts`
- Baseline evidence: blob `5308c8893d1e9102c99041f340cfe81a35e5347d`; 462 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0353 `libs/feed/features/list-feed-items/list-feed-items.result.ts`
- Baseline evidence: blob `9e3aa6e2b7e34be7a337906a8d93591d66de19e4`; 1476 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0354 `libs/feed/features/list-feed-items/list-feed-items.use-case.ts`
- Baseline evidence: blob `8a259f4b2ad9cfb7f432644e0b18d6d96cf8b3e0`; 5760 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0355 `libs/feed/features/shared/feed-item-presenter.ts`
- Baseline evidence: blob `d43f8514de95cc00d127e23e2659673b99b7251d`; 900 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0356 `libs/feed/features/shared/feed-signal-baseline-loader.ts`
- Baseline evidence: blob `e3a01d1e85f22f90e66ee79071546a83c5ea202f`; 4236 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0357 `libs/feed/features/shared/feed-source-breakdown-presenter.ts`
- Baseline evidence: blob `dc5defee3bed16c8fbbf690b428c0b9ae033b7f4`; 4194 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0358 `libs/feed/index.ts`
- Baseline evidence: blob `ca17974b06b813ab7ad59677b29c950895c3e679`; 26 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0359 `libs/feed/interfaces/rest/feed-provider-tokens.ts`
- Baseline evidence: blob `56e95c88845ed82fbe8486ea84caf082e809c1f1`; 1280 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0360 `libs/feed/interfaces/rest/feed-rest.module.ts`
- Baseline evidence: blob `9e4b74a26fbf325b30b79246e51b0ec01837c238`; 3909 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0361 `libs/feed/interfaces/rest/feed.controller.ts`
- Baseline evidence: blob `3ae2046b9d63ad95a8e6c7f23079cd7e536a28a5`; 7114 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0362 `libs/feed/interfaces/rest/list-feed-items.dto.ts`
- Baseline evidence: blob `64cc54f5f4addde16d3e10b2e979d9403dfd8432`; 11514 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0363 `libs/feed/ports/feed-collection-coverage.port.ts`
- Baseline evidence: blob `b9ff68e55bef7a7c7dfeebe06ba0242fed1a70f2`; 797 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0364 `libs/feed/ports/feed-item-read-repository.port.ts`
- Baseline evidence: blob `bb94f4e924c51d5c4a27602fa1ea0c97d2b5c936`; 5773 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0365 `libs/feed/ports/feed-signal-baseline-repository.port.ts`
- Baseline evidence: blob `d11bc02e43a75e73a46c6fe2d28ea70e0b3bdaf7`; 1097 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0366 `libs/feed/ports/index.ts`
- Baseline evidence: blob `dba0db79632e9fbb816f82e43fec929430923eaa`; 155 bytes; exact repository path.
- Owner classification: `libs/feed`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0367 `libs/identity/adapters/authorization/claim-user-workspace-membership.verifier.ts`
- Baseline evidence: blob `2c49c771a0c5445afdf870b5ae38be11d1500c79`; 601 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0368 `libs/identity/adapters/authorization/jwks-user-access-token.verifier.ts`
- Baseline evidence: blob `14c11b350a497db67dc2560e13dfc06f6bf41450`; 9822 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0369 `libs/identity/adapters/authorization/rejecting-user-access-token.verifier.ts`
- Baseline evidence: blob `46b72c5f8cca00b503ee0b6c744dafdac33400b5`; 392 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0370 `libs/identity/adapters/authorization/static-workspace-authorization-policy.ts`
- Baseline evidence: blob `cfeeb64e13206e2b3328d5d7cbd20aab29bf1c12`; 4100 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0371 `libs/identity/adapters/hash/hmac-api-key.hasher.ts`
- Baseline evidence: blob `6d6f51480e69bf077349249e6263a4a08fdbae43`; 704 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0372 `libs/identity/adapters/persistence/in-memory-api-key.repository.ts`
- Baseline evidence: blob `bc60fdd4098da5b319093e132738c6dd2832a7c3`; 2434 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0373 `libs/identity/adapters/persistence/prisma/prisma-api-key.repository.ts`
- Baseline evidence: blob `037b0138cff3f51a39a2aa5524df319e96cfcfd9`; 3398 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0374 `libs/identity/adapters/persistence/prisma/prisma-identity-client.ts`
- Baseline evidence: blob `b6e1abbdd95df3c91df720f0b0591e6524265c72`; 2136 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0375 `libs/identity/adapters/persistence/prisma/prisma-identity-connection.ts`
- Baseline evidence: blob `5f39a13b56d3ebfe992875b0916e5665cf595261`; 1615 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0376 `libs/identity/adapters/persistence/prisma/prisma-identity-records.ts`
- Baseline evidence: blob `26b80fc3358399e7dfd8c3ec7426ed9bd51fae48`; 2555 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0377 `libs/identity/adapters/persistence/prisma/prisma-user-workspace-membership.verifier.ts`
- Baseline evidence: blob `2571bdde40961a98a6eb827ec9563d9f604d1b1f`; 1086 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0378 `libs/identity/adapters/usage/usage-public-api-audit-writer.adapter.ts`
- Baseline evidence: blob `93307939bccf8919ae94013ffbec6b2c412de5c0`; 644 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0379 `libs/identity/adapters/usage/usage-public-api-rate-limiter.adapter.ts`
- Baseline evidence: blob `cc681ae7c20fca04ae37bbacebd339fef233e894`; 648 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0380 `libs/identity/domain/entities/api-key.ts`
- Baseline evidence: blob `1621597de0d5f1dee607926e510cd20ee052eb45`; 2255 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0381 `libs/identity/domain/index.ts`
- Baseline evidence: blob `8f31f32ce111e2f56e4c60395b51a4837bee7ef1`; 36 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0382 `libs/identity/features/create-api-key/create-api-key.command.ts`
- Baseline evidence: blob `96edcc42ec7ce7d1f991ef16b3d0d07b7bb0063e`; 302 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0383 `libs/identity/features/create-api-key/create-api-key.result.ts`
- Baseline evidence: blob `3abf4c177a3aca38fc388cb823ae2de26a895250`; 160 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0384 `libs/identity/features/create-api-key/create-api-key.use-case.ts`
- Baseline evidence: blob `e5eb9b2dfd2c3ec42fa9832d578f39b451590c94`; 1663 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0385 `libs/identity/features/get-auth-session/auth-session-user-role.policy.ts`
- Baseline evidence: blob `e105c5afaa5f3924e8c3bd7796a0036f79615949`; 405 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0386 `libs/identity/features/get-auth-session/get-auth-session.query.ts`
- Baseline evidence: blob `b88c58f75785ce058891a023afb20ac741b28fdc`; 71 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0387 `libs/identity/features/get-auth-session/get-auth-session.result.ts`
- Baseline evidence: blob `63ca6e5c59a7f365bf7391ff60e39891b82c2a52`; 695 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0388 `libs/identity/features/get-auth-session/get-auth-session.use-case.ts`
- Baseline evidence: blob `2633f9fe5619b0bd05b0fb3f3117ab1700142782`; 2166 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0389 `libs/identity/features/list-api-keys/list-api-keys.query.ts`
- Baseline evidence: blob `a9286e3734b3b4e06cf7f1e2a2a395261dd83d23`; 235 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0390 `libs/identity/features/list-api-keys/list-api-keys.result.ts`
- Baseline evidence: blob `a0e84b18b98286480acc6f81d0c936ebb331b2d1`; 176 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0391 `libs/identity/features/list-api-keys/list-api-keys.use-case.ts`
- Baseline evidence: blob `c135e34837ac07719aefd664e75f20c4d2d97583`; 932 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0392 `libs/identity/features/revoke-api-key/revoke-api-key.command.ts`
- Baseline evidence: blob `baaa1b7479c0c405353e69705bbe258045f2f458`; 213 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0393 `libs/identity/features/revoke-api-key/revoke-api-key.result.ts`
- Baseline evidence: blob `d62befde127954dff43ff3d763afc6e646f880a6`; 109 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0394 `libs/identity/features/revoke-api-key/revoke-api-key.use-case.ts`
- Baseline evidence: blob `b3b783aad899fbbb4cd1283ed02939d363b4e221`; 1155 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0395 `libs/identity/features/shared/api-key-presenter.ts`
- Baseline evidence: blob `e257a7f31565ff0bb7a6839b9f08a3b5a4281ea3`; 645 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0396 `libs/identity/features/verify-api-key/verify-api-key.command.ts`
- Baseline evidence: blob `849f6e9e31e4af1cdd803376ea850a669fbc226b`; 155 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0397 `libs/identity/features/verify-api-key/verify-api-key.result.ts`
- Baseline evidence: blob `b6cb7ab5b38eebf8f8fdcfe0fad0f24ecce14ae1`; 133 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0398 `libs/identity/features/verify-api-key/verify-api-key.use-case.ts`
- Baseline evidence: blob `91d449e22056cafdbb7fe5e9c66c2d294c7efafd`; 1489 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0399 `libs/identity/interfaces/authorization/bearer-authorization.ts`
- Baseline evidence: blob `65d0b92c1d9f36b8992cb59470862d9683928d13`; 612 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0400 `libs/identity/interfaces/authorization/identity-authorization.module.ts`
- Baseline evidence: blob `16a22244cb6583f92f25ae9334afbda29579505b`; 782 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0401 `libs/identity/interfaces/authorization/identity-user-auth.module.ts`
- Baseline evidence: blob `d392d03a56f9c1100a1269fc956863bbb031f8d3`; 3582 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0402 `libs/identity/interfaces/authorization/user-workspace-request.authorizer.ts`
- Baseline evidence: blob `72198f615a558ef70613ddbf2d500ff2aec55d62`; 2948 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0403 `libs/identity/interfaces/authorization/workspace-role-header.parser.ts`
- Baseline evidence: blob `c7083318ad5c3d63de07379815e9df2a787c6207`; 780 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0404 `libs/identity/interfaces/rest/api-key-openapi.decorators.ts`
- Baseline evidence: blob `cb2306a45ba5a277c139b0a1e11a00f24769bfc2`; 653 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0405 `libs/identity/interfaces/rest/api-key-request-authorizer.ts`
- Baseline evidence: blob `7d512a59ba23184235dacd3d1c884fb59fe41644`; 13532 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0406 `libs/identity/interfaces/rest/api-keys.controller.ts`
- Baseline evidence: blob `bc43419f0d5948fa4fb0768a92af9ec7ef2c9b0f`; 9533 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0407 `libs/identity/interfaces/rest/api-keys.dto.ts`
- Baseline evidence: blob `d4ce92cf3632b519b9a94bc3e2236efd19208d0f`; 886 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0408 `libs/identity/interfaces/rest/auth-session.controller.ts`
- Baseline evidence: blob `494f1514c654c2a4bd8ebb7f0015f029e4228782`; 1132 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0409 `libs/identity/interfaces/rest/auth-session.dto.ts`
- Baseline evidence: blob `fd8651971884e9773eaf4f5971a5780491ea9629`; 1325 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0410 `libs/identity/interfaces/rest/identity-provider-tokens.ts`
- Baseline evidence: blob `5f990d7eb0d68f37cefae69764be60af4a747eb8`; 5330 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0411 `libs/identity/interfaces/rest/identity-rest.module.ts`
- Baseline evidence: blob `4ca18869440191e6c412aaf600a8bff66943a288`; 5481 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0412 `libs/identity/ports/api-key-hasher.port.ts`
- Baseline evidence: blob `3af650d8de4a93220ae8f34409a59f4826b2b063`; 167 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0413 `libs/identity/ports/api-key-repository.port.ts`
- Baseline evidence: blob `fd590ec434a7354c6fd4018026ea6ae13fac7bef`; 766 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0414 `libs/identity/ports/index.ts`
- Baseline evidence: blob `ded8f165d6bf85e52f3039b2c0e9f6caa94d1a7e`; 343 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0415 `libs/identity/ports/public-api-audit-writer.port.ts`
- Baseline evidence: blob `a3d4a0188167c5c9a438c25ec0f276ee9f70c019`; 1172 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0416 `libs/identity/ports/public-api-rate-limiter.port.ts`
- Baseline evidence: blob `30f43b63eadc891906b373b84c851b105c99af1c`; 599 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0417 `libs/identity/ports/user-access-token-verifier.port.ts`
- Baseline evidence: blob `9cc406ce3f09adcc63edc6efdb1435aadb9e854d`; 633 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0418 `libs/identity/ports/user-workspace-membership-verifier.port.ts`
- Baseline evidence: blob `a4190f9e044477ab485cc7ad435ca0c36a8ba00e`; 917 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0419 `libs/identity/ports/workspace-authorization-policy.port.ts`
- Baseline evidence: blob `18a630f163a8d6c549bef824e1dc653e287b4f96`; 3013 bytes; exact repository path.
- Owner classification: `libs/identity`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0420 `libs/ingestion/adapters/enrichment/article-content-normalization.ts`
- Baseline evidence: blob `a3d90a231dbf3cd9d09878dbe924ed1e1dba5cb6`; 2764 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0421 `libs/ingestion/adapters/enrichment/article-content-source-item-enrichment.adapter.ts`
- Baseline evidence: blob `37947906d960b0f84a476e1176cbcbca2ff35863`; 11455 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0422 `libs/ingestion/adapters/enrichment/google-news-article-resolver.ts`
- Baseline evidence: blob `fa3d478858a590e2cac302f50706e43f880e3fa7`; 4512 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0423 `libs/ingestion/adapters/enrichment/google-news-resolver-http.ts`
- Baseline evidence: blob `884a425833305b18c8c846d403ebf4d7b6af454b`; 2461 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0424 `libs/ingestion/adapters/enrichment/http-readability-article-content-extractor.ts`
- Baseline evidence: blob `df28514d588509adb80411dae47485ba7656e239`; 7735 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0425 `libs/ingestion/adapters/enrichment/readability-worker.ts`
- Baseline evidence: blob `4298a5f3be255c0e7bf846e80257bf7a1b84704a`; 3218 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0426 `libs/ingestion/adapters/eval/json-ranking-eval-dataset.repository.ts`
- Baseline evidence: blob `f276914ab2cd4885c0be6435084f022eb0642574`; 11370 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0427 `libs/ingestion/adapters/eval/json-ranking-eval-query-planner-intent.ts`
- Baseline evidence: blob `38ef555bc8435ef0139753984dab9a9b3e3518fe`; 5831 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0428 `libs/ingestion/adapters/eval/social-research-source-query-planner.adapter.ts`
- Baseline evidence: blob `cea7042064b468d073be25ec1f658c89a0274499`; 114 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0429 `libs/ingestion/adapters/eval/source-item-ranking-candidate.provider.ts`
- Baseline evidence: blob `a4002f6ee0c873f649bb8e883ef7afa9c8984d06`; 1740 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0430 `libs/ingestion/adapters/http/guarded-content-http.ts`
- Baseline evidence: blob `a3708b5559505b07d12368b35876b6e405932eff`; 7014 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0431 `libs/ingestion/adapters/lease/in-memory-scan-lease.adapter.ts`
- Baseline evidence: blob `29be561d89f78eb82c2780e6e122690a02018a3b`; 2031 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0432 `libs/ingestion/adapters/persistence/github-trending-source-identities.ts`
- Baseline evidence: blob `a1d63f81b7bb0dc8eacc2f2e99691176ddfe3389`; 1293 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0433 `libs/ingestion/adapters/persistence/in-memory-github-repository-trend-history.repository.ts`
- Baseline evidence: blob `c550289b0fdd10fb4c0569129f0ce2260cc2161d`; 1025 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0434 `libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository.ts`
- Baseline evidence: blob `a1d39e2280ee2135554df8e4bee0eef8f93bd268`; 816 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0435 `libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository.ts`
- Baseline evidence: blob `a4ca786838893fae518df0c55c1153e14bc8a511`; 675 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0436 `libs/ingestion/adapters/persistence/in-memory-source-candidate-memory.repository.ts`
- Baseline evidence: blob `4f1d5b61694a4db59272b9d56a4e5b8866023d41`; 2927 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0437 `libs/ingestion/adapters/persistence/in-memory-source-item.repository.ts`
- Baseline evidence: blob `8ebb9a748cbe18b464e75b3fda1bf35ac3567869`; 11417 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0438 `libs/ingestion/adapters/persistence/isolated-scan-cursor.repository.ts`
- Baseline evidence: blob `e7a5422abf99de1a6804c241659d4d12c32b2a81`; 1596 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0439 `libs/ingestion/adapters/persistence/prisma-retained-metric-inventory-bulk.spec-support.ts`
- Baseline evidence: blob `39ace090bfd63e7793976934e01c67f21075bd22`; 4656 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0440 `libs/ingestion/adapters/persistence/prisma-retained-metric-inventory-bulk.ts`
- Baseline evidence: blob `ec4247620017896f4e4255028089359ac57c905b`; 4666 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0441 `libs/ingestion/adapters/persistence/prisma-retained-metric-inventory-legacy.spec-support.ts`
- Baseline evidence: blob `61ffcb7f048a6df4f9754d467a8d5cadf77dbd25`; 6873 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0442 `libs/ingestion/adapters/persistence/prisma-retained-metric-inventory-read.spec-support.ts`
- Baseline evidence: blob `7aca162dbe9ea3163c8ae7ec21c04baf4b6131b8`; 2917 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0443 `libs/ingestion/adapters/persistence/prisma-retained-metric-inventory-read.ts`
- Baseline evidence: blob `31277cbb429bf1b429192d33d223b53f7bb1deac`; 7067 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0444 `libs/ingestion/adapters/persistence/prisma-retained-metric-inventory.ts`
- Baseline evidence: blob `4987a0b6475d1455768d2081575eb34d13eb8a79`; 6320 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0445 `libs/ingestion/adapters/persistence/prisma/article-capture-postgres.spec-support.ts`
- Baseline evidence: blob `e232a928add7837296194632268732b55f1a4202`; 4832 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0446 `libs/ingestion/adapters/persistence/prisma/prisma-article-capture-fence.ts`
- Baseline evidence: blob `e8adf668ce5af0caef1c462ff3a782c9a277cd70`; 3793 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0447 `libs/ingestion/adapters/persistence/prisma/prisma-article-capture.repository.ts`
- Baseline evidence: blob `c7a157ef02f0ac83e6af81c025b29e27834061e7`; 13423 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0448 `libs/ingestion/adapters/persistence/prisma/prisma-github-repository-trend-history.repository.ts`
- Baseline evidence: blob `e72e8efc9fc7d5cf2fcc761db349f603eec43539`; 4397 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0449 `libs/ingestion/adapters/persistence/prisma/prisma-ingestion-client.ts`
- Baseline evidence: blob `c138f1a2c7596732a2044ef250a1e82c6683d629`; 12711 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0450 `libs/ingestion/adapters/persistence/prisma/prisma-ingestion-connection.ts`
- Baseline evidence: blob `ee443f0411ab94258b560f8f10f01638f1577e15`; 3161 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0451 `libs/ingestion/adapters/persistence/prisma/prisma-ingestion-records.ts`
- Baseline evidence: blob `513bc7376fbf8b628a14def23c0f05eddf3e008b`; 8724 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0452 `libs/ingestion/adapters/persistence/prisma/prisma-retained-source-capture.repository.ts`
- Baseline evidence: blob `303fd7d9e96a7422722ca8ff0610ef08af700c81`; 9780 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0453 `libs/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository.ts`
- Baseline evidence: blob `1d7b8e8fd4f7887ac3fb9a05a00f211c38fc05be`; 2264 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0454 `libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository.ts`
- Baseline evidence: blob `4e868318e9d3d8e6e02ef70414d41af6e6483a6b`; 1620 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0455 `libs/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter.ts`
- Baseline evidence: blob `0b75c927941a847e79dbc8dc9e7d953a3600d327`; 5804 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0456 `libs/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter.ts`
- Baseline evidence: blob `a709eca69a5dcd84d17fb2fafc77e8b9ec678511`; 2374 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0457 `libs/ingestion/adapters/persistence/prisma/prisma-scan-retry-delivery.ts`
- Baseline evidence: blob `b5a5220e55224e0a2c6f88705cd5089161d9b423`; 1993 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0458 `libs/ingestion/adapters/persistence/prisma/prisma-source-candidate-memory.repository.ts`
- Baseline evidence: blob `d8f8842a15bd2ca07f19cb4740ba376e73dbd98a`; 6605 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0459 `libs/ingestion/adapters/persistence/prisma/prisma-source-item-batch-writer.ts`
- Baseline evidence: blob `18b6cd6fce959bc0b7f623cdeeb1d3fdd55fa336`; 14954 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0460 `libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository.ts`
- Baseline evidence: blob `7eb1637e4e8011753fc6671b5afae3834dde4e50`; 5070 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0461 `libs/ingestion/adapters/persistence/prisma/reddit-archive-persistence-contract.ts`
- Baseline evidence: blob `5c28b94928610cfd851296384fcd2a693ae98f06`; 2263 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0462 `libs/ingestion/adapters/persistence/scan-failure-entry-key.ts`
- Baseline evidence: blob `9fcc5e4d3e18fa266d5c84b1c3f9de6a691e9538`; 662 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0463 `libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter.ts`
- Baseline evidence: blob `50271b7663c71cae98ff41557f47ffa8cbf7d438`; 4369 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0464 `libs/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter.ts`
- Baseline evidence: blob `774d28d34dd3eda6aaa7153862334fed881c0858`; 359 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0465 `libs/ingestion/adapters/source/adaptive-source-pagination.ts`
- Baseline evidence: blob `90cc8f46261425c8fdfa4f7df20a3d7ac9c89814`; 5718 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0466 `libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter.ts`
- Baseline evidence: blob `ead019b2704a59cdff79d484467ee28ef69dc62c`; 2288 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0467 `libs/ingestion/adapters/source/fake-source-fetcher.adapter.ts`
- Baseline evidence: blob `a18f5eedafc2adc246c1c5b8a9f9c09ac7b29494`; 605 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0468 `libs/ingestion/adapters/source/fake-source.provider.ts`
- Baseline evidence: blob `d21d42724a328388d32995e6fac05a95775fde7e`; 2761 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0469 `libs/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client.ts`
- Baseline evidence: blob `7bdc37799e4995dea787a021db1fe341ee093ecb`; 8890 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0470 `libs/ingestion/adapters/source/github-repo-radar/fixture-github-repo-radar-client.ts`
- Baseline evidence: blob `16d001ad07f9d043d225dcf8206073e498a9a1f5`; 2400 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0471 `libs/ingestion/adapters/source/github-repo-radar/fixture-github-repository-live-verifier.ts`
- Baseline evidence: blob `2d1643d2bbbd1ae2753d4ff0454c2ea884fcf1f3`; 1973 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0472 `libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-client.port.ts`
- Baseline evidence: blob `71f565eb81df04554a7e75a891e51554de7e4de5`; 1107 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0473 `libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider.ts`
- Baseline evidence: blob `22ec6b7d3ab5e2a7a97012f31f6c01db21f4892d`; 10877 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0474 `libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter.ts`
- Baseline evidence: blob `a6dc18585238366c181c5065cefd33ba99c9e008`; 1408 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0475 `libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.port.ts`
- Baseline evidence: blob `0f390afb6d45b9ad109d197a3d5f6b4939ce17de`; 735 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0476 `libs/ingestion/adapters/source/github-repo-radar/github-repository-trend-metadata-projection.adapter.ts`
- Baseline evidence: blob `1c227d862599f17b5dc2cbce893d45dbd63c0a67`; 2186 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0477 `libs/ingestion/adapters/source/github-repo-radar/public-http-gh-archive-github-repo-radar-client.ts`
- Baseline evidence: blob `0d6ff58b065142d864e33dfa3711e2957857c072`; 8918 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0478 `libs/ingestion/adapters/source/github-trending-page/fixture-github-trending-page-client.ts`
- Baseline evidence: blob `fbf343a73ceafbdf90e1da87899bfb3861458f99`; 2240 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0479 `libs/ingestion/adapters/source/github-trending-page/github-trending-archive-normalizer.ts`
- Baseline evidence: blob `f995f9efbd7796f1b8f10834e3b8e14b94b4d098`; 4692 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0480 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-canonical-board.ts`
- Baseline evidence: blob `7b0f17a879a98f544fc5b098f5d3d40e47335877`; 2516 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0481 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-client.port.ts`
- Baseline evidence: blob `fa12d98a55c206a45ddd9d8358894a99706f7e43`; 731 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0482 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-html-parser.ts`
- Baseline evidence: blob `0c412b22e55a0a7ab9a5a1a1ffe499b13df8483a`; 3967 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0483 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-snapshot-window.ts`
- Baseline evidence: blob `98c5fffb678b216dfaef6e5932dfff31724d86ed`; 2655 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0484 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-source-config.ts`
- Baseline evidence: blob `c1a50ff85daddaa29d8150f3769c94fe2312d872`; 3472 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0485 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-source-mapping.ts`
- Baseline evidence: blob `b4767547b1d400c3eb9b94bf2bc3b538f39b3f37`; 3225 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0486 `libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider.ts`
- Baseline evidence: blob `188f9196d017235c2c5e7711cbf9417fb6d26c04`; 5730 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0487 `libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client.ts`
- Baseline evidence: blob `8f170bde151ef0cf08aac2160f371c250f20f83e`; 1484 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0488 `libs/ingestion/adapters/source/github/fixture-github-client.ts`
- Baseline evidence: blob `4f03c1aa867ced9c11fee6bc452d806054446f3f`; 2055 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0489 `libs/ingestion/adapters/source/github/github-client.port.ts`
- Baseline evidence: blob `1570846d4093b7d779dce09b37ef2b1bf63c91b2`; 1488 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0490 `libs/ingestion/adapters/source/github/github-source.provider.ts`
- Baseline evidence: blob `528c6ab03698eb8f0b172c8205b8ce17e6338b50`; 5757 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0491 `libs/ingestion/adapters/source/github/http-github-client.ts`
- Baseline evidence: blob `6f4b3d6bf915c23b4d4a0d9ef02cc2b795b66a99`; 6161 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0492 `libs/ingestion/adapters/source/hacker-news/fixture-hacker-news-client.ts`
- Baseline evidence: blob `271d5687f9317b6caae1a2dbfb05c9a981ed34fe`; 2315 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0493 `libs/ingestion/adapters/source/hacker-news/hacker-news-algolia-contracts.ts`
- Baseline evidence: blob `aee07706e4c17f813b5ae7a8511e65f031754528`; 656 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0494 `libs/ingestion/adapters/source/hacker-news/hacker-news-algolia-policy.ts`
- Baseline evidence: blob `163d1b38d80fdcd7842fc14cb7bc841e67815631`; 2460 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0495 `libs/ingestion/adapters/source/hacker-news/hacker-news-client.port.ts`
- Baseline evidence: blob `498e0a80a304518e99679fda223ef0fa53193a1c`; 1896 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0496 `libs/ingestion/adapters/source/hacker-news/hacker-news-comment-enrichment.ts`
- Baseline evidence: blob `359fc8651e85cdd6481f50f6094702e62b0df629`; 11382 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0497 `libs/ingestion/adapters/source/hacker-news/hacker-news-historical-search.ts`
- Baseline evidence: blob `1c5df9cda706bed0cddddab4256b2898bc202248`; 3891 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0498 `libs/ingestion/adapters/source/hacker-news/hacker-news-item-normalizer.ts`
- Baseline evidence: blob `b3191c9662239a78cdf22f1efea9fe521fbcd723`; 6882 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0499 `libs/ingestion/adapters/source/hacker-news/hacker-news-multi-pass-collector.ts`
- Baseline evidence: blob `8b7b809f9551b9caab8ae5444ad97f5b111886dd`; 8719 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0500 `libs/ingestion/adapters/source/hacker-news/hacker-news-provider-mappers.ts`
- Baseline evidence: blob `7af739b5706b0e378dfc41139c8349502a0a28ea`; 3329 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0501 `libs/ingestion/adapters/source/hacker-news/hacker-news-query-match.ts`
- Baseline evidence: blob `5be8cc0f56692b2e114191eb13ee0b48491a9ecd`; 4677 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0502 `libs/ingestion/adapters/source/hacker-news/hacker-news-scan-pass-support.ts`
- Baseline evidence: blob `5451e8e937943e0f025f2444de139a777ae9f8ef`; 7911 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0503 `libs/ingestion/adapters/source/hacker-news/hacker-news-source-window.ts`
- Baseline evidence: blob `45841d7f51dff48709eb084b79a435eca32fe09f`; 5671 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0504 `libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider.ts`
- Baseline evidence: blob `e1a88c00db2af883c35c9be3d8ebbcb2c3956a8e`; 6663 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0505 `libs/ingestion/adapters/source/hacker-news/http-hacker-news-client.ts`
- Baseline evidence: blob `e8a3d830dd9eb53a43e728cda8af037cfea8856c`; 9241 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0506 `libs/ingestion/adapters/source/in-memory-source-provider.registry.ts`
- Baseline evidence: blob `2f531217dfaec5eba135034f53e580fe9e4247c1`; 2325 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0507 `libs/ingestion/adapters/source/monitoring-source-config-reader.adapter.ts`
- Baseline evidence: blob `09df3f57acdc441af012b92062c814d653d9f327`; 3906 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0508 `libs/ingestion/adapters/source/reddit/app-only-reddit-token-provider.ts`
- Baseline evidence: blob `90d9486d8766ad2a8b8b7cff7c88f71dd25364f1`; 5780 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0509 `libs/ingestion/adapters/source/reddit/fixture-reddit-client.ts`
- Baseline evidence: blob `1cadc355d180ff147f98de239936f175d88d0217`; 3174 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0510 `libs/ingestion/adapters/source/reddit/http-reddit-client.ts`
- Baseline evidence: blob `af67227f1eb5e5234b7cc996dddfc4311265e4a8`; 11070 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0511 `libs/ingestion/adapters/source/reddit/reddit-access-token.ts`
- Baseline evidence: blob `ebfa3c811a9dc102a156cd6fc109823584c6a329`; 1848 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0512 `libs/ingestion/adapters/source/reddit/reddit-archive-comment-normalizer.ts`
- Baseline evidence: blob `0ad859863093790294d9869ff0cce220d7293759`; 6782 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0513 `libs/ingestion/adapters/source/reddit/reddit-archive-normalizer.ts`
- Baseline evidence: blob `6a1f14742bda50a9109f0f96112bab0179af8e0b`; 4520 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0514 `libs/ingestion/adapters/source/reddit/reddit-capability-profile.ts`
- Baseline evidence: blob `2a0a5a9d112021db664c23db707d4b933d86216a`; 602 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0515 `libs/ingestion/adapters/source/reddit/reddit-client.port.ts`
- Baseline evidence: blob `60bda6c555d064a01274423fdaf282b8be96fdf9`; 3216 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0516 `libs/ingestion/adapters/source/reddit/reddit-comment-source-support.ts`
- Baseline evidence: blob `1a2c821b2c661cdcd88a2f07abdbd54dfe2bb435`; 3879 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0517 `libs/ingestion/adapters/source/reddit/reddit-multi-pass-collector.ts`
- Baseline evidence: blob `19202164c1015fc50a92e206b41bc10e9f5aac99`; 8552 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0518 `libs/ingestion/adapters/source/reddit/reddit-post-normalizer.ts`
- Baseline evidence: blob `c22e445af5dbd25e6f08f72caabfcd26a8436487`; 4264 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0519 `libs/ingestion/adapters/source/reddit/reddit-selected-comment-enrichment.ts`
- Baseline evidence: blob `04c9dee360a42a5b0864703782fb8048c69beaa4`; 7139 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0520 `libs/ingestion/adapters/source/reddit/reddit-source-support.ts`
- Baseline evidence: blob `62b960fb4a8e3f2a3b069d2f5264dafcaeebaa74`; 11178 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0521 `libs/ingestion/adapters/source/reddit/reddit-source-window-and-lanes.ts`
- Baseline evidence: blob `1915344a772d42aa27efbc2e6277cf423dce5d13`; 6134 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0522 `libs/ingestion/adapters/source/reddit/reddit-source.provider.ts`
- Baseline evidence: blob `994618fb8ccde70289c87d6cba0a2aa13b437177`; 7115 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0523 `libs/ingestion/adapters/source/reddit/reddit-token-provider.port.ts`
- Baseline evidence: blob `a7e416fbafbe3c6322ac0eb0b82eede3a4e49c84`; 82 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0524 `libs/ingestion/adapters/source/reddit/reddit-token-url-policy.ts`
- Baseline evidence: blob `fdcf9a8151f692c94c378ef248f02242a7f3a9e3`; 395 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0525 `libs/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider.ts`
- Baseline evidence: blob `80cf8a023b5270b511ad31088c1fa5031c6ea240`; 6788 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0526 `libs/ingestion/adapters/source/reddit/static-reddit-token-provider.ts`
- Baseline evidence: blob `a71bf2ed75cb9c81e8a46e4238610dcae718afe4`; 289 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0527 `libs/ingestion/adapters/source/registry-source-fetcher.adapter.ts`
- Baseline evidence: blob `b2301b39dc45fa008adba0d69a7742bc95241e68`; 6693 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0528 `libs/ingestion/adapters/source/retained-metric-fetch.capability.ts`
- Baseline evidence: blob `e8b3bebae83191fce069282121ac1d6eee218467`; 5562 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0529 `libs/ingestion/adapters/source/rss/feed-url-policy.ts`
- Baseline evidence: blob `61ddac938f3196b26e8e8449a2869cad04441f2b`; 346 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0530 `libs/ingestion/adapters/source/rss/fixture-rss-client.ts`
- Baseline evidence: blob `b98cca6d9a70b62fdcaa8bcdfed40ca76a20d8c4`; 1187 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0531 `libs/ingestion/adapters/source/rss/http-rss-client.ts`
- Baseline evidence: blob `4e7be1b665b84709067015abbeb2d477cdaf3952`; 2621 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0532 `libs/ingestion/adapters/source/rss/rss-client.port.ts`
- Baseline evidence: blob `50fda44fb1e2d9e6086b944d97d9c61dbe43b8e0`; 2074 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0533 `libs/ingestion/adapters/source/rss/rss-cursor-and-config.ts`
- Baseline evidence: blob `c218b16b443abb78e232c0bf4ea300e449ac34bc`; 4618 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0534 `libs/ingestion/adapters/source/rss/rss-feed-parser.ts`
- Baseline evidence: blob `94ddbcb0d9ffd07ffcb981a73fd7c0cf49664a8b`; 11973 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0535 `libs/ingestion/adapters/source/rss/rss-readable-content.ts`
- Baseline evidence: blob `3d1ecf4b71a799b485b33ed3e6bd27b4a0d6ca9b`; 2560 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0536 `libs/ingestion/adapters/source/rss/rss-source-item-mapping.ts`
- Baseline evidence: blob `090ab5844b36b15a85c5e3c78efb1894116063e8`; 5504 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0537 `libs/ingestion/adapters/source/rss/rss-source-window.ts`
- Baseline evidence: blob `f0a95a3a915576cb5d64070085110656d6cdf5d0`; 4841 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0538 `libs/ingestion/adapters/source/rss/rss-source.provider.ts`
- Baseline evidence: blob `181d7425f7e290ca8d9aca3567d1244b52e1418a`; 8379 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0539 `libs/ingestion/adapters/source/rss/rss-xml-entity-evidence.ts`
- Baseline evidence: blob `aff110951f00c3b3c3790e2d96e6069f3826447f`; 6262 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0540 `libs/ingestion/adapters/source/social-research-source-query-planner.adapter.ts`
- Baseline evidence: blob `d2b9bccc9cf1f36d7c88ef51a4da4197125c6609`; 3417 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0541 `libs/ingestion/adapters/source/source-fetch-result-assembly.ts`
- Baseline evidence: blob `d1a88fbb5f7063f7714cb1aefb859ef946e13a34`; 4799 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0542 `libs/ingestion/adapters/source/source-item-ranking-config.ts`
- Baseline evidence: blob `c22eb0da0d0853edb3288fa9ba0bb79c462a64b2`; 1929 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0543 `libs/ingestion/adapters/source/source-live-evidence-requirements.ts`
- Baseline evidence: blob `896efd37c9937363d9c28cd37adee338f419d802`; 6940 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0544 `libs/ingestion/adapters/source/source-provider-pagination.ts`
- Baseline evidence: blob `3ed6ed024fe46a6a60c76052cae484a09346b5aa`; 5970 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0545 `libs/ingestion/adapters/source/source-provider-runtime-scope.ts`
- Baseline evidence: blob `6eeab8152bd48a49924a1a0bcfd81d91783babb4`; 2784 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0546 `libs/ingestion/adapters/source/source-query-plan-reddit-runtime.ts`
- Baseline evidence: blob `b4ecbe8f2137be2309d2e8ef75628001575a469b`; 8328 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0547 `libs/ingestion/adapters/source/source-query-plan-runtime-compiler.ts`
- Baseline evidence: blob `e3a2cd4da01e3f1bf9d7901b9eaf233939bf13c9`; 8928 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0548 `libs/ingestion/adapters/source/source-query-plan-runtime-support.ts`
- Baseline evidence: blob `54ccbda532764ec427216f5d7afd3bdcf88f6dd0`; 2367 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0549 `libs/ingestion/adapters/source/source-readiness-community-profiles.ts`
- Baseline evidence: blob `5a304ef4e4a9c9ac871307071b7da46867ae220e`; 6090 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0550 `libs/ingestion/adapters/source/source-readiness-fixture-profiles.ts`
- Baseline evidence: blob `70da7e62121146299e15e01a73e298482f337f01`; 1422 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0551 `libs/ingestion/adapters/source/source-readiness-github-profiles.ts`
- Baseline evidence: blob `e3eb77ab692106035d06ad0f4047baf34f32c0d9`; 6616 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0552 `libs/ingestion/adapters/source/source-readiness-profiles.ts`
- Baseline evidence: blob `434da33506b13d3c9a201a7ec1e3bef33f17f3f7`; 2025 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0553 `libs/ingestion/adapters/source/source-readiness-web-profiles.ts`
- Baseline evidence: blob `fe18eb0b89480022e9c68531e2aee5809f60ccd5`; 3516 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0554 `libs/ingestion/adapters/source/source-runtime-config-readers.ts`
- Baseline evidence: blob `b31359993b1a1cffe42d108560d597802c8f63dc`; 1744 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0555 `libs/ingestion/adapters/source/telegram/fixture-telegram-preview-client.ts`
- Baseline evidence: blob `65276593aeb6347db1b67272773d2d91b2acda3e`; 713 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0556 `libs/ingestion/adapters/source/telegram/http-telegram-preview-client.ts`
- Baseline evidence: blob `26eac1ce0037a3143414e77e56aa1e9b6ce87164`; 4202 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0557 `libs/ingestion/adapters/source/telegram/telegram-preview-client.port.ts`
- Baseline evidence: blob `01246939d613f5b8abcf4e560d5c3b8572e37e7a`; 767 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0558 `libs/ingestion/adapters/source/telegram/telegram-preview-config.ts`
- Baseline evidence: blob `2a9464f02d331508661a80284eb8266a9b1dc8f1`; 2888 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0559 `libs/ingestion/adapters/source/telegram/telegram-preview-cursor.ts`
- Baseline evidence: blob `cd1a24fc963803b1c3d0636bcf7257f79f6bc29c`; 3786 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0560 `libs/ingestion/adapters/source/telegram/telegram-preview-html.ts`
- Baseline evidence: blob `b9b318856586fec243dcad9388ead9d67c934aea`; 4770 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0561 `libs/ingestion/adapters/source/telegram/telegram-preview.spec-support.ts`
- Baseline evidence: blob `708f6dbbe281aa457172fcb2cb2ed92455842874`; 2199 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0562 `libs/ingestion/adapters/source/telegram/telegram-source.provider.ts`
- Baseline evidence: blob `700aadaac5128db9b00136c56e52b73c47e8d910`; 10540 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0563 `libs/ingestion/adapters/source/testing/source-provider-certification.ts`
- Baseline evidence: blob `8a9dfb0e21b5f98b6f3101056660de831835a811`; 5433 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0564 `libs/ingestion/adapters/source/x-source-query-plan-runtime-budget.ts`
- Baseline evidence: blob `2a5ef5640d443ab830935e90cd9909509bbb24d2`; 4430 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0565 `libs/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client.ts`
- Baseline evidence: blob `38a270cb0ddc3c5134fed8c5558e86830639e4fc`; 9812 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0566 `libs/ingestion/adapters/source/x-twitter-experimental-daily/static-x-promotion-authority-registry.ts`
- Baseline evidence: blob `c5cb354a02d1aa9b15071b8d15b417c1f5a3d932`; 1040 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0567 `libs/ingestion/adapters/source/x-twitter-experimental-daily/x-collector-runtime-config.ts`
- Baseline evidence: blob `cae565ef59879a8d2b68cc9e128d8a0103337d83`; 1672 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0568 `libs/ingestion/adapters/source/x-twitter-experimental-daily/x-daily-collector-client.port.ts`
- Baseline evidence: blob `a190afba5a589288602467f30fe91973e47cb50b`; 2802 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0569 `libs/ingestion/adapters/source/x-twitter-experimental-daily/x-quoted-post.ts`
- Baseline evidence: blob `0ff13687c9da5d38d2f176a17bcf42c774de140f`; 1164 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0570 `libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-config.ts`
- Baseline evidence: blob `d00fd2f332d671d36b5c49ebcf225541e61ae81a`; 12791 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0571 `libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-item.ts`
- Baseline evidence: blob `4b95540adb8ff447eff038ec2936940ec9b45b0b`; 6059 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0572 `libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider.ts`
- Baseline evidence: blob `c01c24ace3fba3ca19532e65a95f04a88298f91c`; 13204 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0573 `libs/ingestion/domain/entities/scan-attempt.ts`
- Baseline evidence: blob `56c8f059c61589991bf55fd75c2638ce67a798f7`; 3648 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0574 `libs/ingestion/domain/entities/scan-policy.ts`
- Baseline evidence: blob `3035c085460b86e035962d2858cc452a68a599d1`; 1571 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0575 `libs/ingestion/domain/entities/source-binding.ts`
- Baseline evidence: blob `a102214319a054ab7e8bc749dc3c5c70d7af2b2d`; 884 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0576 `libs/ingestion/domain/entities/source-item.ts`
- Baseline evidence: blob `a342272c22584c221385e1df14852c2b2fa7fb1a`; 1473 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0577 `libs/ingestion/domain/entities/source-provider.ts`
- Baseline evidence: blob `e7f0f12bd13762c969cfd5775835f81a02490882`; 2199 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0578 `libs/ingestion/domain/index.ts`
- Baseline evidence: blob `228c1c14937f133f2601dd6db90090fee6d4635b`; 1176 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0579 `libs/ingestion/domain/policies/retained-metric-daily-grant.ts`
- Baseline evidence: blob `ab7bd05af64bf4654793f786c9bff0461853bc87`; 3610 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0580 `libs/ingestion/domain/policies/retained-metric-renewal-grant.ts`
- Baseline evidence: blob `37c8510f5eccef38ccbb2be268adeadb42c4d867`; 2884 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0581 `libs/ingestion/domain/policies/source-candidate-memory-lifecycle.ts`
- Baseline evidence: blob `62cfd7c905f48ab07fe5af4b27b06aa003a3b17a`; 4429 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0582 `libs/ingestion/domain/policies/source-candidate-memory-policy.ts`
- Baseline evidence: blob `f2e2f914e0c7f6b14e4efeb815b5257c235256a3`; 8583 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0583 `libs/ingestion/domain/policies/source-engagement-observation-policy.ts`
- Baseline evidence: blob `1c0a5bffaa266f340e3e99c09a4e56f4d86533c9`; 2227 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0584 `libs/ingestion/domain/policies/source-item-ranking-policy.ts`
- Baseline evidence: blob `e9280a7a12c43138f8e2116fcb7b3ebb667e69a3`; 9980 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0585 `libs/ingestion/domain/policies/source-query-plan-candidate-matching.ts`
- Baseline evidence: blob `2165e318226fe0e2311f98ffacde7495debad496`; 4198 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0586 `libs/ingestion/domain/policies/source-query-plan-eval-policy.ts`
- Baseline evidence: blob `8b7b1055c8b6acf4dafcc6638f7701bbbbb2e353`; 8916 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0587 `libs/ingestion/domain/policies/source-query-plan.ts`
- Baseline evidence: blob `79833cbb69ec82beb788bf7592823cca27148759`; 1364 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0588 `libs/ingestion/domain/policies/source-ranking-eval-metrics.ts`
- Baseline evidence: blob `fa3f73416ef00cb0e22d2bb0417347ee6b55c497`; 4429 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0589 `libs/ingestion/domain/policies/source-ranking-eval-policy.ts`
- Baseline evidence: blob `309d7d828355394e488bb6173a26e95018f5dbd9`; 8285 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0590 `libs/ingestion/domain/value-objects/article-capture-attempt.ts`
- Baseline evidence: blob `0d293ef27419317e7347aae9ca0fc733f98a733a`; 11240 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0591 `libs/ingestion/domain/value-objects/github-repository-trend.ts`
- Baseline evidence: blob `18794f85d1cea7b5a383551bbb346fdc66da04c7`; 7492 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0592 `libs/ingestion/domain/value-objects/github-trending-archive.ts`
- Baseline evidence: blob `62a72ea4aedd21c4e5f77c17a6bc636bc805ca65`; 6652 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0593 `libs/ingestion/domain/value-objects/github-trending-page.ts`
- Baseline evidence: blob `e0545a5701811d51ca2c7171c2bbfbe573ff124f`; 12545 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0594 `libs/ingestion/domain/value-objects/google-news-article.ts`
- Baseline evidence: blob `12ce55570ec5340f50dbda2a40f93112f025c902`; 516 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0595 `libs/ingestion/domain/value-objects/legacy-source-capture.ts`
- Baseline evidence: blob `c6213ab4e348e164a84956520ea242551e666089`; 2952 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0596 `libs/ingestion/domain/value-objects/merge-article-capture-completion.ts`
- Baseline evidence: blob `12ee5d7bb037f9e13f27088738e0b1d11269659c`; 2151 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0597 `libs/ingestion/domain/value-objects/quoted-post-capture-availability.ts`
- Baseline evidence: blob `cbe25c17637db0c537df6ed7cf55738d037e60f6`; 1496 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0598 `libs/ingestion/domain/value-objects/reddit-media-context.ts`
- Baseline evidence: blob `6fca7710000f7801642a7def40196f132994ac6f`; 590 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0599 `libs/ingestion/domain/value-objects/retained-source-content-capture.ts`
- Baseline evidence: blob `dbb304c51d7c5c1e728d1700d50a0d22b40b5636`; 3372 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0600 `libs/ingestion/domain/value-objects/source-article-fetch-policy.ts`
- Baseline evidence: blob `d5a118fea4fcb79af3797169c7e1e63c18063916`; 2781 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0601 `libs/ingestion/domain/value-objects/source-content-capture.ts`
- Baseline evidence: blob `1c87f6e980d31d70b0de0ae97e2fd8463c8a7ac5`; 12077 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0602 `libs/ingestion/domain/value-objects/source-engagement-metrics.ts`
- Baseline evidence: blob `4833d2b9a5dc3b6f888b405b5c740499c61730ba`; 7661 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0603 `libs/ingestion/domain/value-objects/source-engagement-provider-shapes.ts`
- Baseline evidence: blob `367adacdc0d5722c238a999ef43cdd85fae93c66`; 6045 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0604 `libs/ingestion/domain/value-objects/source-item-content-fingerprint.ts`
- Baseline evidence: blob `4a0889fb24f81082ac7a4dbc2a923f7a5fcfa53d`; 3662 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0605 `libs/ingestion/domain/value-objects/telegram-public-channel.ts`
- Baseline evidence: blob `32cb463199c9fbe2f919dee28ee2075d06a8aa7b`; 1021 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0606 `libs/ingestion/domain/x-observation/x-canonical-days.ts`
- Baseline evidence: blob `9eb5f5df16108ed83db3c5cb10b57d87b32a9048`; 130 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0607 `libs/ingestion/domain/x-observation/x-canonical-graph-policy.ts`
- Baseline evidence: blob `ccab1c22bfc53f0bd698ef745e5471fb3d936b22`; 5917 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0608 `libs/ingestion/domain/x-observation/x-canonical-predicate.ts`
- Baseline evidence: blob `a73670d6081f3daed9097c589be32d49eec6bc8d`; 1483 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0609 `libs/ingestion/domain/x-observation/x-canonical-query-budget.ts`
- Baseline evidence: blob `4d7dc503373f8c2e00013586d9bb4dc2438a176c`; 938 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0610 `libs/ingestion/domain/x-observation/x-observation-acquisition-contract.ts`
- Baseline evidence: blob `5ce937b334fc1b3f9e597bdcc2531da3ab7a847d`; 8719 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0611 `libs/ingestion/domain/x-observation/x-observation-contract.ts`
- Baseline evidence: blob `8fb56aef015c06168745f0d97c8d6fd8249bd1f1`; 7149 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0612 `libs/ingestion/domain/x-observation/x-observation.spec-support.ts`
- Baseline evidence: blob `e6aea1446cc5041bd5163b66a9e7ec526868bead`; 6134 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0613 `libs/ingestion/features/execute-scan/capture-scanned-source-items.ts`
- Baseline evidence: blob `f8b4fe3508a77ca13e77025e3cdf732f3483a900`; 9000 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0614 `libs/ingestion/features/execute-scan/execute-scan-persisted-source-items.ts`
- Baseline evidence: blob `59a4ebaefc7d1e5b93f19a85cf20b849d228c00f`; 3514 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0615 `libs/ingestion/features/execute-scan/execute-scan.command.ts`
- Baseline evidence: blob `629829ac7f5a6780d51db9bf34eb5e626d361a84`; 674 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0616 `libs/ingestion/features/execute-scan/execute-scan.result.ts`
- Baseline evidence: blob `da5d5ca6de8d2e9095f91132facd47ee8362823a`; 335 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0617 `libs/ingestion/features/execute-scan/execute-scan.use-case.spec-support.ts`
- Baseline evidence: blob `daa33c64a222efc6f48876c5ae729e074fbc9b0f`; 12806 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0618 `libs/ingestion/features/execute-scan/execute-scan.use-case.ts`
- Baseline evidence: blob `218eb02fc570824da2f8c9d4d69ea3a7508e3dd7`; 13351 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0619 `libs/ingestion/features/execute-scan/execute-with-scan-lease.ts`
- Baseline evidence: blob `0f0344d76b3046f2bdca596f1b8ebc10dad068ff`; 845 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0620 `libs/ingestion/features/execute-scan/persist-scanned-source-items.ts`
- Baseline evidence: blob `8ebc8c642a77d9e19e173d3af602eed385d73f23`; 3301 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0621 `libs/ingestion/features/execute-scan/scan-attempt-idempotency.ts`
- Baseline evidence: blob `85b1cef75de2fc5e8d39036092f79d6448777f05`; 1617 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0622 `libs/ingestion/features/execute-scan/scan-collection-coordinator.ts`
- Baseline evidence: blob `fe234e1b3a1ad5bb0b0de6fbdc5a77daf7409689`; 8902 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0623 `libs/ingestion/features/execute-scan/scan-collection-execution-metadata.ts`
- Baseline evidence: blob `21cfa75cf55f5657227dacfdb54f0d2135445d1f`; 6590 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0624 `libs/ingestion/features/execute-scan/scan-execution-failure.ts`
- Baseline evidence: blob `20010c9ed0595832b64a24c01ea4c0e34fa2b015`; 1722 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0625 `libs/ingestion/features/execute-scan/scan-failure-recording.ts`
- Baseline evidence: blob `76c70b4f0bf1ad1014cbded7a0790dea254e15e1`; 1129 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0626 `libs/ingestion/features/execute-scan/scan-outcome-reporting.ts`
- Baseline evidence: blob `425ca49c0485d9264a43074ad14997719387e2e8`; 693 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0627 `libs/ingestion/features/execute-scan/scan-source-sanitization.ts`
- Baseline evidence: blob `5fd29b7406bbd7662c1f5b39ed7c11074a6af20b`; 4639 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0628 `libs/ingestion/features/execute-scan/source-candidate-memory-coordinator.ts`
- Baseline evidence: blob `e90fdad80c28e3ca3f4df825a95dc2778ca84723`; 8093 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0629 `libs/ingestion/features/execute-scan/source-engagement-sample-coordinator.ts`
- Baseline evidence: blob `d43fb89e1c42eef618530fd7cc0a3d46553e8188`; 5130 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0630 `libs/ingestion/features/list-scan-dead-letters/list-scan-dead-letters.query.ts`
- Baseline evidence: blob `8755c4ac4474ebf3cf85025aa24b2bc1c5371a4a`; 216 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0631 `libs/ingestion/features/list-scan-dead-letters/list-scan-dead-letters.result.ts`
- Baseline evidence: blob `3ea0f834d3fa5a57d09d8fafd99d2d8e175b352d`; 601 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0632 `libs/ingestion/features/list-scan-dead-letters/list-scan-dead-letters.use-case.ts`
- Baseline evidence: blob `531b0e43efec53376693909d8fceafedbb732feb`; 3031 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0633 `libs/ingestion/features/list-source-profiles/list-source-profiles.result.ts`
- Baseline evidence: blob `3ff4b40fdec20274230640657667308a2e61846e`; 1435 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0634 `libs/ingestion/features/list-source-profiles/list-source-profiles.use-case.ts`
- Baseline evidence: blob `85c7e83ee8d12dbe4ac2b5a7d736185f56c73ac3`; 4054 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0635 `libs/ingestion/features/observe-retained-x/x-canonical-plan.contracts.ts`
- Baseline evidence: blob `0f4709bc81da8ae0ed6b28d999f6e441cc5a7b09`; 3026 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0636 `libs/ingestion/features/observe-retained-x/x-observation.contracts.ts`
- Baseline evidence: blob `69ee8299d2b28037144b1edb178b0dbe7904bfae`; 2507 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0637 `libs/ingestion/features/provider-collection-slo/provider-collection-slo-policy.ts`
- Baseline evidence: blob `04929de1a4fa2618f293101db7a91284412914d3`; 3989 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0638 `libs/ingestion/features/refresh-retained-metrics/amend-retained-metric-manifest.use-case.ts`
- Baseline evidence: blob `d3568fba9fddaaaa522acf20f119093598edaf74`; 6220 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0639 `libs/ingestion/features/refresh-retained-metrics/execute-retained-metric-batches.ts`
- Baseline evidence: blob `765aec5f0aced7510231c673eef230fe472e52c0`; 9195 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0640 `libs/ingestion/features/refresh-retained-metrics/metric-daily-evidence.ts`
- Baseline evidence: blob `c6b2af3b5bf9058e6d53fbb0a9847e4c2047e9e6`; 5581 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0641 `libs/ingestion/features/refresh-retained-metrics/metric-daily-manifest.ts`
- Baseline evidence: blob `eb71205ebde44dc729fbb5f3e4dc67b314b08ce7`; 7198 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0642 `libs/ingestion/features/refresh-retained-metrics/metric-daily.contracts.ts`
- Baseline evidence: blob `66af6c89e68f43832b926e0c1ba9b154db30b1b1`; 804 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0643 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-admission.ts`
- Baseline evidence: blob `9047f0b801867de7ab24e1f377a4e69e22a76757`; 5967 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0644 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-amendment.ts`
- Baseline evidence: blob `486a8860dd65b81ac3d9dc63e9244ff580a96237`; 7129 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0645 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-effect-evidence.ts`
- Baseline evidence: blob `444939e0350064665ddccd17c880b781094373d2`; 9173 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0646 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-evidence-validation.ts`
- Baseline evidence: blob `7b668c09c10c3fa5666d07683f6e030675612d2f`; 5896 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0647 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts.ts`
- Baseline evidence: blob `dc153cfacac7b29710792b4b958a88ce0b921630`; 1661 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0648 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-report.ts`
- Baseline evidence: blob `0409139b2baf65973cac64efd22be5d07c3a8e87`; 1048 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0649 `libs/ingestion/features/refresh-retained-metrics/metric-refresh-result-binding.spec-support.ts`
- Baseline evidence: blob `f345d4fa9af92cf5740f943cbb56cd3036117d58`; 5014 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0650 `libs/ingestion/features/refresh-retained-metrics/metric-renewal-evidence.ts`
- Baseline evidence: blob `db9d79189511e4e61eb2b395ecc636685e110659`; 10191 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0651 `libs/ingestion/features/refresh-retained-metrics/metric-renewal-report.ts`
- Baseline evidence: blob `8b6bdd10bb40ce56912c30a97b441691ba655f8b`; 661 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0652 `libs/ingestion/features/refresh-retained-metrics/metric-renewal.contracts.ts`
- Baseline evidence: blob `59bc4eca7811f31755585d420f4264c16151a26f`; 1534 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0653 `libs/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts.ts`
- Baseline evidence: blob `23765a043ec0dfb3d4fb6a10eac7b4290a92f9b0`; 2921 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0654 `libs/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case.ts`
- Baseline evidence: blob `cbaf8d81baab4d846349ad6802686b4a02ba12ff`; 2644 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0655 `libs/ingestion/features/refresh-retained-metrics/renew-daily-retained-metrics.use-case.ts`
- Baseline evidence: blob `cf7c45426b10039cb785b3a3ce1e457f49ec6b9c`; 7847 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0656 `libs/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case.ts`
- Baseline evidence: blob `e4734395eb9a6a0469956603b8b2ccca28575bae`; 6870 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0657 `libs/ingestion/features/run-source-query-planner-eval/run-source-query-planner-eval.command.ts`
- Baseline evidence: blob `f1601daf1ee1ff96337524fe51e8d0e2838191c6`; 223 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0658 `libs/ingestion/features/run-source-query-planner-eval/run-source-query-planner-eval.result.ts`
- Baseline evidence: blob `d2eb6c7cad5fc768fbde091598c4bc540fbda651`; 523 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0659 `libs/ingestion/features/run-source-query-planner-eval/run-source-query-planner-eval.use-case.ts`
- Baseline evidence: blob `7853b321c6db87265e53aaada15acd7a3b560fd5`; 2841 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0660 `libs/ingestion/features/run-source-ranking-eval/run-source-ranking-eval.command.ts`
- Baseline evidence: blob `23f24df87182bf0944da170dd584271cf114487d`; 196 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0661 `libs/ingestion/features/run-source-ranking-eval/run-source-ranking-eval.result.ts`
- Baseline evidence: blob `79c20fcccd8b11f230178b2d38cfca430f58bb89`; 474 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0662 `libs/ingestion/features/run-source-ranking-eval/run-source-ranking-eval.use-case.ts`
- Baseline evidence: blob `a3762bfdadc2c1f615c34b74a7dccb9289f37f6e`; 2633 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0663 `libs/ingestion/infrastructure/x-observation/x-canonical-digest.ts`
- Baseline evidence: blob `02ff3e2eec1aea3fa81c68f4b08b6b733e8a2d40`; 1086 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0664 `libs/ingestion/infrastructure/x-observation/x-canonical-plan-compiler.ts`
- Baseline evidence: blob `36126e53371e9378bf119bd279b3834c2841751d`; 23865 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0665 `libs/ingestion/infrastructure/x-observation/x-canonical-plan-input.ts`
- Baseline evidence: blob `d151c0bca5b92c51d2c7b1770b0f8f4b47244961`; 12428 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0666 `libs/ingestion/infrastructure/x-observation/x-observation-digest.ts`
- Baseline evidence: blob `02ff3e2eec1aea3fa81c68f4b08b6b733e8a2d40`; 1086 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0667 `libs/ingestion/infrastructure/x-observation/x-observation-wire.ts`
- Baseline evidence: blob `c36619e27b1189f196713bebe90d80bb8a74f36b`; 6064 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0668 `libs/ingestion/interfaces/queue/execute-scan-command.handler.ts`
- Baseline evidence: blob `c653092949584a931e85556f9f72634505707578`; 8727 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0669 `libs/ingestion/interfaces/rest/ingestion-provider-tokens.ts`
- Baseline evidence: blob `f0ca5f0d8e939f1d242a0e5d30979b425f48557f`; 1909 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0670 `libs/ingestion/interfaces/rest/ingestion-rest.module.ts`
- Baseline evidence: blob `9b1bcc04d994180beea36d0e2b2c0d281c08ba51`; 10146 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0671 `libs/ingestion/interfaces/rest/scan-dead-letter.controller.ts`
- Baseline evidence: blob `a4714637d95c67e35e5e3307d35ed258966f580a`; 3725 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0672 `libs/ingestion/interfaces/rest/scan-dead-letter.dto.ts`
- Baseline evidence: blob `4ed50b1c691e7c269aba9d70d323308b8cc8e7f2`; 306 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0673 `libs/ingestion/interfaces/rest/source-profile.controller.ts`
- Baseline evidence: blob `f565c008b22f1ba8790cb7c759b883e44183fd63`; 828 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0674 `libs/ingestion/interfaces/rest/source-profile.dto.ts`
- Baseline evidence: blob `f439f98e0f8a215bf6d7070582e5c6ba463adc1a`; 4263 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0675 `libs/ingestion/interfaces/source/source-provider-registry-provider-tokens.ts`
- Baseline evidence: blob `667fe7fc11ea8ccf7fc49661dffa33cab25bd091`; 3957 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0676 `libs/ingestion/interfaces/source/source-provider-registry.providers.ts`
- Baseline evidence: blob `784c22584b2d1be8704db0872f80f8146780a914`; 11681 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0677 `libs/ingestion/ports/article-capture-repository.ts`
- Baseline evidence: blob `abb629be0ca1f6fac5969d61956175d75ec8b9ae`; 1655 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0678 `libs/ingestion/ports/article-content-extractor.port.ts`
- Baseline evidence: blob `28902031096dbd80dc6c941e172490099f61abd0`; 1140 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0679 `libs/ingestion/ports/conversation-projection.port.ts`
- Baseline evidence: blob `2d64f7c210bca4c3360db900d1b051d4137f89dc`; 1209 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0680 `libs/ingestion/ports/feed-projection.port.ts`
- Baseline evidence: blob `8970196cc51a5b17ba406575f3b8dc25f3dc8c89`; 1316 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0681 `libs/ingestion/ports/github-repository-trend-history-repository.port.ts`
- Baseline evidence: blob `69a0c9b1fb855ebf84683ae421db46ecb666d55a`; 1293 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0682 `libs/ingestion/ports/index.ts`
- Baseline evidence: blob `75bbc678680e6a4f2e1b94226686f86eeff766ca`; 1106 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0683 `libs/ingestion/ports/ranking-candidate-provider.port.ts`
- Baseline evidence: blob `466c6723c09f3230c9235c40790842f5ed0a7591`; 444 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0684 `libs/ingestion/ports/ranking-eval-dataset-repository.port.ts`
- Baseline evidence: blob `3287b12f53ba3f1efe18146446b427bbdc958103`; 566 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0685 `libs/ingestion/ports/retained-source-capture-repository.ts`
- Baseline evidence: blob `7df2a44e6b3515114022a891e0abc23e2d1481d9`; 869 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0686 `libs/ingestion/ports/scan-attempt-repository.port.ts`
- Baseline evidence: blob `47086812254d90a0501c9b3d5c04a50d443a42a0`; 430 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0687 `libs/ingestion/ports/scan-cursor-repository.port.ts`
- Baseline evidence: blob `c0fc37baa7b6c8063f6372a555ddf33b7b499e82`; 665 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0688 `libs/ingestion/ports/scan-execution-reporter.port.ts`
- Baseline evidence: blob `5072d1178fe3b3c91eae9149b23fe9dc2f63833a`; 832 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0689 `libs/ingestion/ports/scan-failure-queue.port.ts`
- Baseline evidence: blob `72f72d4fdb5f1803eda77b6ec1af29fbcae2f655`; 2165 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0690 `libs/ingestion/ports/scan-lease.port.ts`
- Baseline evidence: blob `a6d704d4437378192589637d20ba0f49435e3b51`; 702 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0691 `libs/ingestion/ports/source-candidate-memory.port.ts`
- Baseline evidence: blob `9fc34c5872307aa8d99c89cdc92ba814ba4e44c4`; 1730 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0692 `libs/ingestion/ports/source-config-reader.port.ts`
- Baseline evidence: blob `40757133c7c33a246dafddfe0c2bac15a4750ef9`; 565 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0693 `libs/ingestion/ports/source-engagement-projection.port.ts`
- Baseline evidence: blob `8443bf1727111986edc895f76bcd8eb3d6b2124b`; 1511 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0694 `libs/ingestion/ports/source-fetcher.port.ts`
- Baseline evidence: blob `78bbb88c879c999917013261301540ce429f37f7`; 2817 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0695 `libs/ingestion/ports/source-item-enrichment.port.ts`
- Baseline evidence: blob `117944d6b274e971a498fe6a25e428a5170bc9b3`; 1377 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0696 `libs/ingestion/ports/source-item-metadata-projection.port.ts`
- Baseline evidence: blob `a58be66dbe508842ff82d015e6b9d3f664ead074`; 836 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0697 `libs/ingestion/ports/source-item-repository.port.ts`
- Baseline evidence: blob `ae4e39a930c2b56a41730fca44698899a51b4ae2`; 1541 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0698 `libs/ingestion/ports/source-provider-registry.port.ts`
- Baseline evidence: blob `030ceafb2b24485e740aa4ff641e613da3e4df10`; 545 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0699 `libs/ingestion/ports/source-provider.port.ts`
- Baseline evidence: blob `e46cb4bd8e5289716072f4c76a5ccd8e482b1f39`; 3296 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0700 `libs/ingestion/ports/source-query-planner.port.ts`
- Baseline evidence: blob `870f494bb3a727fa2fae42eb004f90977dc4a571`; 222 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0701 `libs/ingestion/ports/source-readiness-profile.port.ts`
- Baseline evidence: blob `50dd51b331f1613e4ae8ba6bbb6a918f1e635f2e`; 1982 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0702 `libs/ingestion/ports/x-promotion-authority-registry.port.ts`
- Baseline evidence: blob `9005f572f20b2b4155597f0f3e4a2bfed543704b`; 482 bytes; exact repository path.
- Owner classification: `libs/ingestion`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0703 `libs/launch/adapters/static/static-beta-launch-support.read-model.ts`
- Baseline evidence: blob `d1ab54a9e4c9f860b526428f0e4e95a6548bed70`; 5646 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0704 `libs/launch/domain/beta-launch-support.ts`
- Baseline evidence: blob `e77eee612ddfbe8307700fbcb2a572e70a76dc6c`; 1202 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0705 `libs/launch/domain/index.ts`
- Baseline evidence: blob `eb36d9e2685a733eb68f56eba9342bfe16191b44`; 39 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0706 `libs/launch/features/get-beta-launch-support/get-beta-launch-support.result.ts`
- Baseline evidence: blob `aabc95e39a3aac85c2831d008c5d7d4065c67be3`; 492 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0707 `libs/launch/features/get-beta-launch-support/get-beta-launch-support.use-case.ts`
- Baseline evidence: blob `775e7e8b66576811636a05b0002e7f6499b29067`; 468 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0708 `libs/launch/interfaces/rest/beta-launch-support.controller.ts`
- Baseline evidence: blob `0f9b53ee6bfb5dc60d79f77410f9c36488b29b56`; 3175 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0709 `libs/launch/interfaces/rest/beta-launch-support.dto.ts`
- Baseline evidence: blob `e786c4f859a0ed55e01410b1a9b1b9b35684f9b9`; 769 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0710 `libs/launch/interfaces/rest/launch-rest.module.ts`
- Baseline evidence: blob `8cb5342a793fb0cdb52c7d2b04de8fb6b9d566bf`; 1017 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0711 `libs/launch/ports/beta-launch-support-read-model.port.ts`
- Baseline evidence: blob `977148fd9eb38171ddaf5b3cf1a379587b65b83d`; 255 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0712 `libs/launch/ports/index.ts`
- Baseline evidence: blob `a8415066346bcf1b4e36287703adeb67d3c0f0ca`; 55 bytes; exact repository path.
- Owner classification: `libs/launch`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0713 `libs/monitoring/adapters/credentials/guarded-oauth2-token-http-client.ts`
- Baseline evidence: blob `0fe175b402ae711dd500a55df2b47bcff9bb3b15`; 3460 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0714 `libs/monitoring/adapters/credentials/noop-source-credential-refresher.ts`
- Baseline evidence: blob `6552547cfb75bbb308e092277209c0463897b1a6`; 522 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0715 `libs/monitoring/adapters/credentials/oauth2-source-credential-refresher.ts`
- Baseline evidence: blob `73a32309a93dd1785c7060b28680d5779135af7a`; 6435 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0716 `libs/monitoring/adapters/idempotency/in-memory-idempotency.adapter.ts`
- Baseline evidence: blob `0fb7c1e8883fd7e02fdf932049c91d8fdde89ef1`; 1186 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0717 `libs/monitoring/adapters/idempotency/prisma/prisma-idempotency.adapter.ts`
- Baseline evidence: blob `06f14ef6fbf304ccfd13596da96dcf2e4930e9b7`; 2029 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0718 `libs/monitoring/adapters/messaging/in-memory-outbox.adapter.ts`
- Baseline evidence: blob `2defa9782880573398f825688cc7bafc7430cbd3`; 1158 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0719 `libs/monitoring/adapters/persistence/in-memory-interest-creation-state.ts`
- Baseline evidence: blob `c6279e564379284d83a8f3a6d719aa3981d9e270`; 4696 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0720 `libs/monitoring/adapters/persistence/in-memory-interest-creation.store.ts`
- Baseline evidence: blob `fa529e5eff36607b5280cae0173b4e76d67d5fd3`; 2958 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0721 `libs/monitoring/adapters/persistence/in-memory-interest.repository.ts`
- Baseline evidence: blob `59c6b33d29ff9fed4e4435ddb4c10748c50fd265`; 3493 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0722 `libs/monitoring/adapters/persistence/in-memory-scan-execution-attempt-read-model.ts`
- Baseline evidence: blob `6a0471480463651480fbb6c7cf0cd185b1671948`; 758 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0723 `libs/monitoring/adapters/persistence/in-memory-scan-job.repository.ts`
- Baseline evidence: blob `6a2c4b53aa62ea48a32bc803820cf00135616f7c`; 6596 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0724 `libs/monitoring/adapters/persistence/in-memory-scan-policy.repository.ts`
- Baseline evidence: blob `0c17a99a56291dd5a2733e61a4da71e99c36df97`; 1660 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0725 `libs/monitoring/adapters/persistence/in-memory-scan-scheduler-decision-history.repository.ts`
- Baseline evidence: blob `c564aca7f9348a0bc01a94c2e34528cca8c4104e`; 1701 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0726 `libs/monitoring/adapters/persistence/in-memory-source-binding-creation.store.ts`
- Baseline evidence: blob `70a0f87dd7108ce2891a961d49b5e241f1367828`; 3581 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0727 `libs/monitoring/adapters/persistence/in-memory-source-binding-status-change.store.ts`
- Baseline evidence: blob `b04f9a7226111fdca6912803c0201565da6af147`; 3447 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0728 `libs/monitoring/adapters/persistence/in-memory-source-binding.repository.ts`
- Baseline evidence: blob `47070fc4a469c924169252cb561fd08e73ebeca9`; 3573 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0729 `libs/monitoring/adapters/persistence/in-memory-source-credential.repository.ts`
- Baseline evidence: blob `67ca469a043aa4dc862772aa45969b54a7bee241`; 2490 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0730 `libs/monitoring/adapters/persistence/offset-pagination.ts`
- Baseline evidence: blob `78750492e149e9c5d3ea248c2d807fefb030951e`; 549 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0731 `libs/monitoring/adapters/persistence/prisma/prisma-interest-creation.store.ts`
- Baseline evidence: blob `e8f9a3cccb98d12abc66dfdd5fd5de96ee06454a`; 5646 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0732 `libs/monitoring/adapters/persistence/prisma/prisma-interest.repository.ts`
- Baseline evidence: blob `4193266b7554345ba86768918a7b97f3f641c96e`; 3202 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0733 `libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client.ts`
- Baseline evidence: blob `2427c7ab61d98b756d32f75c4c3202aaf8d99e88`; 15873 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0734 `libs/monitoring/adapters/persistence/prisma/prisma-monitoring-connection.ts`
- Baseline evidence: blob `2c8e1c319f01ff7a73e00c0cb6498f62e3e729ba`; 3119 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0735 `libs/monitoring/adapters/persistence/prisma/prisma-monitoring-outbox.adapter.ts`
- Baseline evidence: blob `2fee22ec22b97bec5e53d945618b5f83faf2dcdc`; 923 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0736 `libs/monitoring/adapters/persistence/prisma/prisma-monitoring-records.ts`
- Baseline evidence: blob `f1dc78332de3d80f1d382fc2f15eb32cffc11ff9`; 12786 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0737 `libs/monitoring/adapters/persistence/prisma/prisma-scan-dispatch.adapter.ts`
- Baseline evidence: blob `c4abeb099305b483049ad96be7b35a8827aa7843`; 4380 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0738 `libs/monitoring/adapters/persistence/prisma/prisma-scan-execution-attempt-read-model.ts`
- Baseline evidence: blob `33f54a9060910b116c78a32a2bc2a50e1e33dba7`; 1812 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0739 `libs/monitoring/adapters/persistence/prisma/prisma-scan-job.repository.ts`
- Baseline evidence: blob `89a2701db15c6665772fd5685ad665a298e8cf69`; 6747 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0740 `libs/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository.ts`
- Baseline evidence: blob `cfcb9be292f1a3a09faf8e5db5820bcfda2985a5`; 2698 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0741 `libs/monitoring/adapters/persistence/prisma/prisma-scan-scheduler-decision-history.repository.ts`
- Baseline evidence: blob `117aa283b42276adbc77ab1238550cd7bcfb3b26`; 3800 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0742 `libs/monitoring/adapters/persistence/prisma/prisma-source-binding-creation.store.ts`
- Baseline evidence: blob `2761cfbe8dccf06dad0d7f1a2b919e7effd67fd4`; 6717 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0743 `libs/monitoring/adapters/persistence/prisma/prisma-source-binding-status-change.store.ts`
- Baseline evidence: blob `deff5aee393089c0eefc07b94f6d2fc9ec6b8142`; 6757 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0744 `libs/monitoring/adapters/persistence/prisma/prisma-source-binding.repository.ts`
- Baseline evidence: blob `1baf09f8e86494a069860b63dc53c449aa798a5f`; 5766 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0745 `libs/monitoring/adapters/persistence/prisma/prisma-source-credential.repository.ts`
- Baseline evidence: blob `401ee240f381b6434b23db61b195034aadeb7cfa`; 3394 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0746 `libs/monitoring/adapters/queue/direct-scan-dispatch.adapter.ts`
- Baseline evidence: blob `61999763941ab2e6385cccc27ec631a0749a8562`; 5407 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0747 `libs/monitoring/adapters/queue/in-memory-scan-queue.adapter.ts`
- Baseline evidence: blob `abb1c327ad13e84959feb28e5bd7e8ea03c2479d`; 4240 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0748 `libs/monitoring/adapters/quota/usage-scan-request-quota.adapter.ts`
- Baseline evidence: blob `ffd58b95405d7a4c1bda06c14915d8f9f7559bd6`; 1339 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0749 `libs/monitoring/adapters/reporting/monitoring-scan-execution-reporter.adapter.ts`
- Baseline evidence: blob `db2e11205f8fca19172845896fb4a30a03c231dd`; 1429 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0750 `libs/monitoring/adapters/secrets/in-memory-source-credential.vault.ts`
- Baseline evidence: blob `e8565ae013e598b168a8fe4b0cd3482ad43ac6da`; 744 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0751 `libs/monitoring/adapters/secrets/prisma/prisma-source-credential.vault.ts`
- Baseline evidence: blob `8460198b046cc9d36f30536a8cf0963cfd4adcbd`; 4083 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0752 `libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector.ts`
- Baseline evidence: blob `6d6d66fd1d3dbcdbf6d95d291b436ae13b4dfa84`; 5793 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0753 `libs/monitoring/adapters/source-catalog/fake-source-catalog.adapter.ts`
- Baseline evidence: blob `6cecc6e6ea22bab06b5432dda65b1c37bd8cc883`; 14161 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0754 `libs/monitoring/adapters/source-catalog/telegram-source-binding-config.ts`
- Baseline evidence: blob `f5d228c0ee18db9b075f0b344db7b331e4961859`; 2143 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0755 `libs/monitoring/application/contracts/interest-creation-commit.ts`
- Baseline evidence: blob `73fe1c1171614b73dfd089ffa658930e8f6364ff`; 785 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0756 `libs/monitoring/application/contracts/source-binding-creation-commit.ts`
- Baseline evidence: blob `ea5417c326a3c90e021500265f4433e164dfc9ca`; 943 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0757 `libs/monitoring/application/contracts/source-binding-status-change-commit.ts`
- Baseline evidence: blob `3db947ba9f344201f95145d9b1662aeaad59a45f`; 931 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0758 `libs/monitoring/application/interest-creation-decision.ts`
- Baseline evidence: blob `0c86e86529c0e9f3baeab9c643841eae85184a08`; 2515 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0759 `libs/monitoring/application/scan-dispatch-plan.ts`
- Baseline evidence: blob `d6d4502c73aaaac470d1e175717a2e9b36ce0036`; 1732 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0760 `libs/monitoring/application/source-binding-creation-decision.ts`
- Baseline evidence: blob `eae075e7f9a4e318fb083d2157a74c0a125c460d`; 2869 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0761 `libs/monitoring/application/source-binding-status-change-decision.ts`
- Baseline evidence: blob `6565f6a5beb41d2c5c139562af5c496f33849586`; 3932 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0762 `libs/monitoring/domain/entities/interest.ts`
- Baseline evidence: blob `94ece92db450ee520d1fc882198877c354ffcf30`; 1235 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0763 `libs/monitoring/domain/entities/scan-job.ts`
- Baseline evidence: blob `ce2f6ebaac7ec933d30ad20af275574fa06dc99f`; 5506 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0764 `libs/monitoring/domain/entities/scan-policy.ts`
- Baseline evidence: blob `c5e48275f4a2b309249b820ce08dc2fbedae39b3`; 2442 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0765 `libs/monitoring/domain/entities/source-binding.ts`
- Baseline evidence: blob `535715bfba9274761bd5467573a617105b390577`; 1913 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0766 `libs/monitoring/domain/entities/source-credential.ts`
- Baseline evidence: blob `948643cbf89863d407ca6a077c24e1a0834867c4`; 4120 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0767 `libs/monitoring/domain/events/interest-created.event.ts`
- Baseline evidence: blob `8e6df28b439503221310d7b73b99672804bfed8d`; 359 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0768 `libs/monitoring/domain/events/scan-policy-set.event.ts`
- Baseline evidence: blob `c6c3c6d4a8e091c38ce1f531ecde970e4a2544fa`; 445 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0769 `libs/monitoring/domain/events/scan-requested.event.ts`
- Baseline evidence: blob `88bca21325c1ea334653b5b3fe45819d1bb4ae59`; 402 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0770 `libs/monitoring/domain/events/source-binding-config-expanded.event.ts`
- Baseline evidence: blob `a794a557d3b90b3b90a852507bc9463ddece112d`; 539 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0771 `libs/monitoring/domain/events/source-binding-config-expansion-reverted.event.ts`
- Baseline evidence: blob `7b543799cfc6843e575ac2c1f1df1e2fe65d9aa3`; 567 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0772 `libs/monitoring/domain/events/source-binding-enabled.event.ts`
- Baseline evidence: blob `38d80d22e49a8d95881abe378f419ed6ea8b4662`; 436 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0773 `libs/monitoring/domain/events/source-binding-status-changed.event.ts`
- Baseline evidence: blob `84f653876de3efbac6f191539bb03b9c8e457450`; 569 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0774 `libs/monitoring/domain/index.ts`
- Baseline evidence: blob `605e75339735ececa4841208b6bb62587b53ca9a`; 600 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0775 `libs/monitoring/domain/policies/provider-scan-cadence.ts`
- Baseline evidence: blob `ff5083c59100731ebbe49a67bb26865d2e96ed43`; 4316 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0776 `libs/monitoring/domain/policies/scan-admission-policy.ts`
- Baseline evidence: blob `5d7539c7a6fc2519a70e29ac3d05bddf11fefb90`; 2695 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0777 `libs/monitoring/domain/policies/scan-failure-classification.ts`
- Baseline evidence: blob `83c0666a941246bae9ac0268789290d374049ca5`; 1774 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0778 `libs/monitoring/domain/policies/scan-freshness-policy.ts`
- Baseline evidence: blob `5bb974b0f5877093f6cc8d26ab387cb898c5dca3`; 5919 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0779 `libs/monitoring/domain/policies/scan-schedule-policy.ts`
- Baseline evidence: blob `d3a1e2f8cfe1503d42af7fd10315d8068d17b881`; 1787 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 0780 `libs/monitoring/features/apply-accepted-topic-recommendation/accepted-topic-recommendation-validation.ts`
- Baseline evidence: blob `11a1d7d094895837ea02906b766d7351e8a27f8d`; 2793 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0781 `libs/monitoring/features/apply-accepted-topic-recommendation/accepted-topic-rollback-token.ts`
- Baseline evidence: blob `f3a31fd4728d50aed59614c2bfd26584cbaeca34`; 2301 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0782 `libs/monitoring/features/apply-accepted-topic-recommendation/accepted-topic-source-binding-config-expander.ts`
- Baseline evidence: blob `d191226d1d338cdbe057362e4cbc21109ab1fb8e`; 5479 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0783 `libs/monitoring/features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.command.ts`
- Baseline evidence: blob `2cd86d77222fe93ae9fdfd60710c2b570deeedfe`; 1058 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0784 `libs/monitoring/features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.result.ts`
- Baseline evidence: blob `ebc82fc9c1d61f69eed36c82d2a10e6594e16102`; 1294 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0785 `libs/monitoring/features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case.ts`
- Baseline evidence: blob `926003cc4c2348a901009c87a5723852dfc656d1`; 7651 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0786 `libs/monitoring/features/apply-accepted-topic-recommendation/prepare-accepted-topic-binding-update.ts`
- Baseline evidence: blob `e9090f65d85612b584fa588dac6a1bb0c6c0b005`; 4258 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0787 `libs/monitoring/features/apply-accepted-topic-recommendation/revert-accepted-topic-binding-update.ts`
- Baseline evidence: blob `4f8b1148ac9e7bd08329ecfa06666f69c75eedaa`; 4339 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0788 `libs/monitoring/features/archive-interest/archive-interest.command.ts`
- Baseline evidence: blob `5a97d9e98bc3a650caf933e8bc171d7bfbe1fc97`; 218 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0789 `libs/monitoring/features/archive-interest/archive-interest.result.ts`
- Baseline evidence: blob `91130855ef67aa67fd80ea4792dd10b16c6e3d88`; 117 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0790 `libs/monitoring/features/archive-interest/archive-interest.use-case.ts`
- Baseline evidence: blob `444213fd5419f2d362a80f53d92e322775fb4086`; 1635 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0791 `libs/monitoring/features/bind-source/bind-source.command.ts`
- Baseline evidence: blob `781e404c6a6229ef4172afe223049ed9678f8239`; 447 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0792 `libs/monitoring/features/bind-source/bind-source.result.ts`
- Baseline evidence: blob `5eeee47057f72993d3664233525a8f2638663d57`; 101 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0793 `libs/monitoring/features/bind-source/bind-source.use-case.ts`
- Baseline evidence: blob `bcb245bf38c2ebdf9b58d87fe781cd191d911a0e`; 4600 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0794 `libs/monitoring/features/change-source-binding-status/change-source-binding-status.command.ts`
- Baseline evidence: blob `24d8ea35d3a0fba93217bd6b9b3a172787f05c4d`; 431 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0795 `libs/monitoring/features/change-source-binding-status/change-source-binding-status.result.ts`
- Baseline evidence: blob `d566f2e1ab2cbc62a30a7985b09fa1fee70e3513`; 214 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0796 `libs/monitoring/features/change-source-binding-status/change-source-binding-status.use-case.ts`
- Baseline evidence: blob `d3cdc623d96d604e2b8798127c761346029316b4`; 1180 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0797 `libs/monitoring/features/create-interest/create-interest.command.ts`
- Baseline evidence: blob `b155e2132407744cc508f2fcc1f1c472ba31e59e`; 306 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0798 `libs/monitoring/features/create-interest/create-interest.result.ts`
- Baseline evidence: blob `58b1bbdb550497709e0cb6de071d5e8340324a3e`; 124 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0799 `libs/monitoring/features/create-interest/create-interest.use-case.ts`
- Baseline evidence: blob `a40c7d2e40f9357b16eb031cdfe2846319b951c2`; 2887 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0800 `libs/monitoring/features/create-source-credential/create-source-credential.command.ts`
- Baseline evidence: blob `a8fbd1997f5c2d7d5d812867a28c5e06f129e8cd`; 529 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0801 `libs/monitoring/features/create-source-credential/create-source-credential.result.ts`
- Baseline evidence: blob `2597cfbc2931dc7e8304d7f80bdac1bd95ed6cb8`; 183 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0802 `libs/monitoring/features/create-source-credential/create-source-credential.use-case.ts`
- Baseline evidence: blob `f4fac63207add22d06d09227bcdc0fb5afa75568`; 2555 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0803 `libs/monitoring/features/get-scan-policy/get-scan-policy.query.ts`
- Baseline evidence: blob `68632ba48fea6e6554f13ffca35f998d3bdc0708`; 219 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0804 `libs/monitoring/features/get-scan-policy/get-scan-policy.result.ts`
- Baseline evidence: blob `902dbf8d13337531cce12b79a149e7d2e7715814`; 122 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0805 `libs/monitoring/features/get-scan-policy/get-scan-policy.use-case.ts`
- Baseline evidence: blob `25a252f2e2ed06af4acc0cbc6e69b1c52bd6ef86`; 1685 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0806 `libs/monitoring/features/get-scan-status/get-scan-status.query.ts`
- Baseline evidence: blob `419ab5e7627ab52d85e40713e05ccb858e2fb7d4`; 213 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0807 `libs/monitoring/features/get-scan-status/get-scan-status.result.ts`
- Baseline evidence: blob `48ca16a4bedd2e42d8f94637a39101827bcd178e`; 962 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0808 `libs/monitoring/features/get-scan-status/get-scan-status.use-case.ts`
- Baseline evidence: blob `aa1f52e0e339bdb22421a240eb45f9d82bf96183`; 2176 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0809 `libs/monitoring/features/get-source-binding-health/get-source-binding-health.query.ts`
- Baseline evidence: blob `bb39de4c7be448a566e69c6a3ff8b0dacf3806f4`; 259 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0810 `libs/monitoring/features/get-source-binding-health/get-source-binding-health.result.ts`
- Baseline evidence: blob `a47a76b51a84826b1d7c68f6b0a327c5c3616d0f`; 3950 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0811 `libs/monitoring/features/get-source-binding-health/get-source-binding-health.use-case.ts`
- Baseline evidence: blob `b5057e5779488a281a149d78b8247b12f58757b9`; 9293 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0812 `libs/monitoring/features/get-source-binding-health/source-binding-health-evaluation.ts`
- Baseline evidence: blob `ec7f439190498790717bc33d4988079e0ae55da7`; 5288 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0813 `libs/monitoring/features/get-source-binding-health/source-binding-health-explanation.ts`
- Baseline evidence: blob `df06a3d3c94d413532bb0991ecf20b068b0326da`; 9047 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0814 `libs/monitoring/features/get-source-binding-health/source-binding-scheduler-decision.ts`
- Baseline evidence: blob `74c60337e8b2f06eedd602fbc0489edd8ec5e359`; 5756 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0815 `libs/monitoring/features/list-interest-source-daily-history/interest-source-daily-history-presenter.ts`
- Baseline evidence: blob `7db6e4f2325dc117582670d49fd4eb715601e60d`; 5985 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0816 `libs/monitoring/features/list-interest-source-daily-history/interest-source-daily-history-provider-view.ts`
- Baseline evidence: blob `d2acc124bb0c182d579b7c88149083417f4b64db`; 12084 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0817 `libs/monitoring/features/list-interest-source-daily-history/list-interest-source-daily-history.query.ts`
- Baseline evidence: blob `8748b1ab157494a493047cbbfcc51c4d222d0e32`; 301 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0818 `libs/monitoring/features/list-interest-source-daily-history/list-interest-source-daily-history.result.ts`
- Baseline evidence: blob `7ae765d68b78d3ea79f87f40c7561a822015952f`; 5638 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0819 `libs/monitoring/features/list-interest-source-daily-history/list-interest-source-daily-history.spec-support.ts`
- Baseline evidence: blob `3ad51921a4b85623967ee9f5d9a935f2d9857e86`; 11352 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0820 `libs/monitoring/features/list-interest-source-daily-history/list-interest-source-daily-history.use-case.ts`
- Baseline evidence: blob `769f45fa17b4280f8408779c974fc16bb577f63e`; 9821 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0821 `libs/monitoring/features/list-interests/list-interests.query.ts`
- Baseline evidence: blob `d9a145dd71d563580f272e346bfd8075e46d1099`; 237 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0822 `libs/monitoring/features/list-interests/list-interests.result.ts`
- Baseline evidence: blob `ccad550dec7e53505bd41c42625deb900c221afc`; 185 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0823 `libs/monitoring/features/list-interests/list-interests.use-case.ts`
- Baseline evidence: blob `57b46d063e817c39a6614fcfdfcd30421f421485`; 966 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0824 `libs/monitoring/features/list-source-binding-daily-history/list-source-binding-daily-history.query.ts`
- Baseline evidence: blob `363246679fe24d4cec7061fbd436edb925be6bbf`; 260 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0825 `libs/monitoring/features/list-source-binding-daily-history/list-source-binding-daily-history.result.ts`
- Baseline evidence: blob `20b81a0ab7ba3dd29f054eec0480e5916e1aff9e`; 2883 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0826 `libs/monitoring/features/list-source-binding-daily-history/list-source-binding-daily-history.use-case.ts`
- Baseline evidence: blob `67afc59e030a47dd13ac55368213b80e16bbc40a`; 11744 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0827 `libs/monitoring/features/list-source-binding-overview/list-source-binding-overview-degradation-reasons.ts`
- Baseline evidence: blob `c2512a10621d2bbc55d1789daded20d576bd442a`; 7804 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0828 `libs/monitoring/features/list-source-binding-overview/list-source-binding-overview.query.ts`
- Baseline evidence: blob `a4fb1a9da141f64f098a3d64f40d59930dff2c3d`; 366 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0829 `libs/monitoring/features/list-source-binding-overview/list-source-binding-overview.result.ts`
- Baseline evidence: blob `73482c9bd34fb47d5b8894d7e1d1e844a8f3e497`; 3003 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0830 `libs/monitoring/features/list-source-binding-overview/list-source-binding-overview.use-case.ts`
- Baseline evidence: blob `69ba70e3b2a47fbedba84d58baaaf937280ef916`; 11008 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0831 `libs/monitoring/features/list-source-binding-scans/list-source-binding-scans.query.ts`
- Baseline evidence: blob `5f05eae07461bec19caeb8914d36e82228b1fa6d`; 323 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0832 `libs/monitoring/features/list-source-binding-scans/list-source-binding-scans.result.ts`
- Baseline evidence: blob `f5764c72f3ae17cfabf4fa892a27731c87ea3973`; 1207 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0833 `libs/monitoring/features/list-source-binding-scans/list-source-binding-scans.use-case.ts`
- Baseline evidence: blob `87aaf34c32cc63af90505c672f61e15aecf4c954`; 4729 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0834 `libs/monitoring/features/list-source-bindings/list-source-bindings.query.ts`
- Baseline evidence: blob `73de52ca42bcffc25a94a9cdc2b6e0bef126a8a9`; 359 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0835 `libs/monitoring/features/list-source-bindings/list-source-bindings.result.ts`
- Baseline evidence: blob `0045207d12516fd8e2159b3bcbb9d29cce0908dd`; 211 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0836 `libs/monitoring/features/list-source-bindings/list-source-bindings.use-case.ts`
- Baseline evidence: blob `b5081a111f51897ea269b212819acfe2954b5892`; 3738 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0837 `libs/monitoring/features/list-source-credentials/list-source-credentials.query.ts`
- Baseline evidence: blob `4b12a82f26f0a885a60ab08fc2cd2dd39a3225d3`; 278 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0838 `libs/monitoring/features/list-source-credentials/list-source-credentials.result.ts`
- Baseline evidence: blob `7732bb553f716f65ae02cd122e45128615ca96d6`; 226 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0839 `libs/monitoring/features/list-source-credentials/list-source-credentials.use-case.ts`
- Baseline evidence: blob `23e42f7d4206451c2c4ac0d923783405bd819616`; 816 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0840 `libs/monitoring/features/plan-interest-coverage/interest-coverage-provider-draft-planners.ts`
- Baseline evidence: blob `3bbe887c6254591c68b9ee4d9b0016327b00c3a6`; 11035 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0841 `libs/monitoring/features/plan-interest-coverage/interest-coverage-source-packs.ts`
- Baseline evidence: blob `d1a0a3c3f0d59131e3bf1d9d960095c491e70a2a`; 9202 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0842 `libs/monitoring/features/plan-interest-coverage/plan-interest-coverage.command.ts`
- Baseline evidence: blob `f95c02507f8f7178b0692bc3bd1f63461361079e`; 517 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0843 `libs/monitoring/features/plan-interest-coverage/plan-interest-coverage.result.ts`
- Baseline evidence: blob `71f78c0b7d3515fc6b22772063c5093e8a14f1ad`; 2573 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0844 `libs/monitoring/features/plan-interest-coverage/plan-interest-coverage.use-case.ts`
- Baseline evidence: blob `767f7b87fb340ebd76cfdaaaac14e3cdddb072df`; 10422 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0845 `libs/monitoring/features/record-scan-execution/record-scan-execution.command.ts`
- Baseline evidence: blob `b50c92c2dd879c40a0320d3904709d50b3b4c8a4`; 546 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0846 `libs/monitoring/features/record-scan-execution/record-scan-execution.result.ts`
- Baseline evidence: blob `6dc52821a0706adc4ba455177a1c0fbeec1b0f6a`; 161 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0847 `libs/monitoring/features/record-scan-execution/record-scan-execution.use-case.ts`
- Baseline evidence: blob `6903fe33c44d5485945f0318f385b98c4e660f6f`; 2625 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0848 `libs/monitoring/features/request-scan/request-scan-decision.presenter.ts`
- Baseline evidence: blob `c49247d22438b76f93fdfa65dfad41aac9ce485f`; 2707 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0849 `libs/monitoring/features/request-scan/request-scan.command.ts`
- Baseline evidence: blob `344361bc71b9cc84884686b7ef9a7a94d74021ee`; 288 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0850 `libs/monitoring/features/request-scan/request-scan.result.ts`
- Baseline evidence: blob `c6cefea74d0133e7da354aa1b6653278282766da`; 1167 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0851 `libs/monitoring/features/request-scan/request-scan.use-case.ts`
- Baseline evidence: blob `3c7b9e6eec317f95f8c792e43051d4c21f7c5fc5`; 8285 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0852 `libs/monitoring/features/resolve-source-credential/resolve-source-credential.use-case.ts`
- Baseline evidence: blob `2b5b2108b780ecb7ac1a34d9f1d9fb96e999aa7f`; 3548 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0853 `libs/monitoring/features/revoke-source-credential/revoke-source-credential.command.ts`
- Baseline evidence: blob `a0d9e868fc35479b73166149a1b3496a3da522dc`; 233 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0854 `libs/monitoring/features/revoke-source-credential/revoke-source-credential.result.ts`
- Baseline evidence: blob `2b6bceff5f5b2f568ad5feb50b4a0c8b5e0b552a`; 183 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0855 `libs/monitoring/features/revoke-source-credential/revoke-source-credential.use-case.ts`
- Baseline evidence: blob `e7ccac58cfac6bc86b3a92bd9a908f312b40d6d1`; 1443 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0856 `libs/monitoring/features/rotate-source-credential/rotate-source-credential.command.ts`
- Baseline evidence: blob `9964157f9261e80067000847d2899216897b8435`; 439 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0857 `libs/monitoring/features/rotate-source-credential/rotate-source-credential.result.ts`
- Baseline evidence: blob `74cdcbb4a335aadf14c088c4be0004e7d361503d`; 183 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0858 `libs/monitoring/features/rotate-source-credential/rotate-source-credential.use-case.ts`
- Baseline evidence: blob `d5a9621396fa558d723614491d522ccf374ea5c1`; 2488 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0859 `libs/monitoring/features/schedule-due-scans/evaluate-due-scan-policy.ts`
- Baseline evidence: blob `0bc58d9cc6ce4bde8394db54d834d336ba750f38`; 11003 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0860 `libs/monitoring/features/schedule-due-scans/schedule-due-scans-decision-support.ts`
- Baseline evidence: blob `cfaaa6bd1969dc1ca3c2d820879c1b17e7fb93d1`; 3698 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0861 `libs/monitoring/features/schedule-due-scans/schedule-due-scans.command.ts`
- Baseline evidence: blob `7d0eac25b1868e056e153ad1d36a995d49e58413`; 289 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0862 `libs/monitoring/features/schedule-due-scans/schedule-due-scans.result.ts`
- Baseline evidence: blob `a638f959a6c14143371d55db8f3e6bdaf291dab1`; 1613 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0863 `libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case.ts`
- Baseline evidence: blob `7c013c42974adf5d3b4f6f8f829c17c8e941ec37`; 3883 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0864 `libs/monitoring/features/set-scan-policy/set-scan-policy.command.ts`
- Baseline evidence: blob `6dd5946cd40648379a7ca2cab05e87fe974c9198`; 395 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0865 `libs/monitoring/features/set-scan-policy/set-scan-policy.result.ts`
- Baseline evidence: blob `197ce728aae0818cd7ef67fdb799009752760c7e`; 130 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0866 `libs/monitoring/features/set-scan-policy/set-scan-policy.use-case.ts`
- Baseline evidence: blob `ba84e3a449e5dbcf141b0b3b2c51a27216283b75`; 6921 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0867 `libs/monitoring/features/shared/interest-presenter.ts`
- Baseline evidence: blob `f6121782f3a0dd833698bcf6065a068ec45ded64`; 562 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0868 `libs/monitoring/features/shared/monitoring-capacity-limits.ts`
- Baseline evidence: blob `77274df809b7b588091ef5b7823a1e65c87ddc30`; 304 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0869 `libs/monitoring/features/shared/scan-cadence-policy.ts`
- Baseline evidence: blob `519aede90f6110331af89f7097a7defa342fb508`; 129 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0870 `libs/monitoring/features/shared/scan-policy-presenter.ts`
- Baseline evidence: blob `8d628062693a7f3b6019b8e3a06cde0dc1aea600`; 1915 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0871 `libs/monitoring/features/shared/scan-provider-health-summary.ts`
- Baseline evidence: blob `6b5f75582bd91fb546c4870ce263a255d37df5c7`; 5312 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0872 `libs/monitoring/features/shared/scan-scheduler-decision-summary.ts`
- Baseline evidence: blob `9b8292e1d8b9227494cfa3f058589ca71edb244b`; 3803 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0873 `libs/monitoring/features/shared/scan-status-view.ts`
- Baseline evidence: blob `1def06bb748c35d5ddfac424904581cfd5880514`; 2343 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0874 `libs/monitoring/features/shared/source-binding-presenter.ts`
- Baseline evidence: blob `5c0b5152073f163cb184ffe1bed79264e10a2399`; 2256 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0875 `libs/monitoring/features/shared/source-binding-scan-query.ts`
- Baseline evidence: blob `74c80f11d8961b4b747737160463c0ae3b33320e`; 3615 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0876 `libs/monitoring/features/shared/source-credential-presenter.ts`
- Baseline evidence: blob `2730a06093fd861ca1cb5b9cf27a99c08a5ba625`; 1054 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0877 `libs/monitoring/features/shared/source-credential-preview-policy.ts`
- Baseline evidence: blob `3aef210c9dd4eadaefcd11a8599fb6f9e8d26e89`; 1814 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0878 `libs/monitoring/features/shared/source-credential-secret-policy.ts`
- Baseline evidence: blob `889761554b30fb45784e4bd41e5f02e770aec2f6`; 1426 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0879 `libs/monitoring/features/source-credential-test-fixtures.ts`
- Baseline evidence: blob `75bf57e0a20d79607d314906c0cdc47aa9454146`; 3785 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0880 `libs/monitoring/features/update-interest/update-interest.command.ts`
- Baseline evidence: blob `5c4904a0de3097dc9ebfdd2860ae10e4c00ef983`; 268 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0881 `libs/monitoring/features/update-interest/update-interest.result.ts`
- Baseline evidence: blob `113b6bf84c871e0487c31c3be3f09828eb4c17df`; 116 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0882 `libs/monitoring/features/update-interest/update-interest.use-case.ts`
- Baseline evidence: blob `900ef582462933c0a4c9f610e840a185ec17779d`; 2205 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0883 `libs/monitoring/interfaces/queue/schedule-due-scans-command.handler.ts`
- Baseline evidence: blob `5fefdd3706c9b33f828994cfd50ab451c8da9e51`; 6626 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0884 `libs/monitoring/interfaces/rest/bind-source.dto.ts`
- Baseline evidence: blob `2c1613423fd16f2a556418f2d9b3217c953d50ed`; 1503 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0885 `libs/monitoring/interfaces/rest/create-interest.dto.ts`
- Baseline evidence: blob `7849c4f45da1561c22752d0fc42a36d73b72d527`; 494 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0886 `libs/monitoring/interfaces/rest/get-scan-policy.dto.ts`
- Baseline evidence: blob `1c8454267906f31be5a05907393605dffb091d1b`; 1031 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0887 `libs/monitoring/interfaces/rest/interest-coverage-plan.controller.ts`
- Baseline evidence: blob `b2c0c2ff519f4861d98ba151bd7b12472ecbc5bc`; 3896 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0888 `libs/monitoring/interfaces/rest/interest-coverage-plan.dto.ts`
- Baseline evidence: blob `bd35f1145f54f6431d443f48090c41802f9225cb`; 8629 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0889 `libs/monitoring/interfaces/rest/interest-source-daily-history.dto.ts`
- Baseline evidence: blob `d1571532e94b1c3a0883341f85fc005315cbaf21`; 11341 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0890 `libs/monitoring/interfaces/rest/interest.controller.ts`
- Baseline evidence: blob `c123144786b7e3e69254097a76591cf9ff87a4e5`; 10209 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0891 `libs/monitoring/interfaces/rest/list-interests.dto.ts`
- Baseline evidence: blob `19689856e20c999a99d1e24d9bcc30f1ee2cc886`; 917 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0892 `libs/monitoring/interfaces/rest/list-source-bindings.dto.ts`
- Baseline evidence: blob `6501d1deab6bc6c0bcd03f0a4f2a1c936f9d5483`; 1357 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0893 `libs/monitoring/interfaces/rest/monitoring-capacity-limit-provider.ts`
- Baseline evidence: blob `5ca2784ef0cee83e8cd212c9c8a59552dec924e0`; 831 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0894 `libs/monitoring/interfaces/rest/monitoring-interest.providers.ts`
- Baseline evidence: blob `0d93bbed5bb891ba40260ed0dc3c0d3a30381477`; 2751 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0895 `libs/monitoring/interfaces/rest/monitoring-persistence.providers.ts`
- Baseline evidence: blob `a58003460b3bcf29a48132e4f711f66f805bce93`; 8221 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0896 `libs/monitoring/interfaces/rest/monitoring-prisma-client.module.ts`
- Baseline evidence: blob `79a5e6047e83676dd1f2f02714f5fd34c4697a60`; 1093 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0897 `libs/monitoring/interfaces/rest/monitoring-provider-tokens.ts`
- Baseline evidence: blob `3e5a9e0ab6985f0152d59f1d191b3662695e4e9b`; 7196 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0898 `libs/monitoring/interfaces/rest/monitoring-rest.module.ts`
- Baseline evidence: blob `ebdfd6ccc6a5a88e1ba54ada926fddd346d590e6`; 4509 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0899 `libs/monitoring/interfaces/rest/monitoring-scan-dispatch.providers.ts`
- Baseline evidence: blob `6dee161eed590376b06eb41c8539181879232d7a`; 2583 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0900 `libs/monitoring/interfaces/rest/monitoring-scan-queue.providers.ts`
- Baseline evidence: blob `216b65b32890e8f98295f278182dc0ab515cd80b`; 3582 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0901 `libs/monitoring/interfaces/rest/monitoring-scan-workflow.providers.ts`
- Baseline evidence: blob `5d4c3447f912bed448318f6f2b3402aa6fd6682a`; 5942 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0902 `libs/monitoring/interfaces/rest/monitoring-scheduler.providers.ts`
- Baseline evidence: blob `167f089f28fc1011809cec400e6e4e03d1be310c`; 4074 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0903 `libs/monitoring/interfaces/rest/monitoring-source-binding.providers.ts`
- Baseline evidence: blob `ecf29245eecd7ec1ad93650b8bcf9c5c2e5abe1a`; 5856 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0904 `libs/monitoring/interfaces/rest/monitoring-source-credential.providers.ts`
- Baseline evidence: blob `10494b5b58fbc472b98cf7ce38cbd15011949f78`; 5738 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0905 `libs/monitoring/interfaces/rest/request-scan.dto.ts`
- Baseline evidence: blob `f4e437b82916150f097efbdb4d54b9dea5e9803a`; 8873 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0906 `libs/monitoring/interfaces/rest/scan-policy-cadence.dto.ts`
- Baseline evidence: blob `8dd9a4f0e3733d5db72e7c082a3d8c34aa4569dd`; 711 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0907 `libs/monitoring/interfaces/rest/scan-policy.controller.ts`
- Baseline evidence: blob `f8f1fbb57b40e7ce90504fa912cff730f7387982`; 8286 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0908 `libs/monitoring/interfaces/rest/scan-request.controller.ts`
- Baseline evidence: blob `d607d258086b40cf3442c6640f78970136d3d51b`; 12439 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0909 `libs/monitoring/interfaces/rest/scan-status-view.ts`
- Baseline evidence: blob `1be768658c77bffc7b2e81a0191207e88aa72881`; 56 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0910 `libs/monitoring/interfaces/rest/scan-status.controller.ts`
- Baseline evidence: blob `67a85fd731f957884ba9b96677da9b8ae3f415a1`; 4989 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0911 `libs/monitoring/interfaces/rest/scan-status.dto.ts`
- Baseline evidence: blob `3ac7ddcf1eba3084b26f7e034283014b8e6ec877`; 2655 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0912 `libs/monitoring/interfaces/rest/set-scan-policy.dto.ts`
- Baseline evidence: blob `49a990d3796af48e11af5542ffbf16281215860a`; 666 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0913 `libs/monitoring/interfaces/rest/source-binding-access.service.ts`
- Baseline evidence: blob `9ee7ee85134629dc8b4802e1265de9a6468ed59c`; 3690 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0914 `libs/monitoring/interfaces/rest/source-binding-health.dto.ts`
- Baseline evidence: blob `1242a35e169a61649d235beeb19aca709e9db158`; 10350 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0915 `libs/monitoring/interfaces/rest/source-binding-overview.dto.ts`
- Baseline evidence: blob `b2c6bcb0e6badd7836e1ff973e3177ffdeeb28e2`; 5751 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0916 `libs/monitoring/interfaces/rest/source-binding-status.dto.ts`
- Baseline evidence: blob `4218a9f098f7dc70010c784b4932515f4568215d`; 674 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0917 `libs/monitoring/interfaces/rest/source-binding.controller.ts`
- Baseline evidence: blob `4c36488bca381a223a8f41c9eeeed8c191d9e6ae`; 15615 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0918 `libs/monitoring/interfaces/rest/source-credential.controller.ts`
- Baseline evidence: blob `aab6d5d86f5b6ad2ffa5063d986998e8c27bb88f`; 12665 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0919 `libs/monitoring/interfaces/rest/source-credential.dto.ts`
- Baseline evidence: blob `538ed097cedc7e9f9f1689a5c8b0c35c9103ad17`; 4414 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0920 `libs/monitoring/interfaces/rest/update-interest.dto.ts`
- Baseline evidence: blob `3eab7ed66c4ea8c8c70f39f929c44c48ba53f1b6`; 339 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0921 `libs/monitoring/ports/idempotency.port.ts`
- Baseline evidence: blob `89b3f9585f165113421bae5ff2787b784e83eecf`; 504 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0922 `libs/monitoring/ports/index.ts`
- Baseline evidence: blob `e97feaa2df23ca5b959a00e9efdb36dfb7817ac8`; 871 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0923 `libs/monitoring/ports/interest-repository.port.ts`
- Baseline evidence: blob `80898df24ccbe042a28714e12f3a5e7e71ce2c68`; 1035 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0924 `libs/monitoring/ports/outbox.port.ts`
- Baseline evidence: blob `ddd15b4c043e30b4747796ad63563c15dbae123c`; 183 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0925 `libs/monitoring/ports/scan-dispatch.port.ts`
- Baseline evidence: blob `8a58d1573eae428cef7933ecd25ca204f1879687`; 402 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0926 `libs/monitoring/ports/scan-execution-attempt-read.port.ts`
- Baseline evidence: blob `9c6cd3edc13e41e150c277b7b8536bcfe3ef8623`; 908 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0927 `libs/monitoring/ports/scan-job-history-read.port.ts`
- Baseline evidence: blob `41285554849c27007917c2e7e1936be33b2dc81d`; 1205 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0928 `libs/monitoring/ports/scan-job-outcome-repository.port.ts`
- Baseline evidence: blob `c87e62c86672a41b6fb058db6e5d3112483d4f53`; 241 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0929 `libs/monitoring/ports/scan-job-repository.port.ts`
- Baseline evidence: blob `2a8757ae8bc6562f37dc4285cf74c6830968dd63`; 779 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0930 `libs/monitoring/ports/scan-policy-repository.port.ts`
- Baseline evidence: blob `9647ab125804711001fe86947c9933591bf51c85`; 509 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0931 `libs/monitoring/ports/scan-queue.port.ts`
- Baseline evidence: blob `c609e5290f1929ef29ec2afb0629d686084065d1`; 860 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0932 `libs/monitoring/ports/scan-request-quota.port.ts`
- Baseline evidence: blob `2733435f50f4543aa86890aa43ea4ef5e9049237`; 566 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0933 `libs/monitoring/ports/scan-scheduler-decision-history.port.ts`
- Baseline evidence: blob `d3f1352777345b6e32ce86d25c61a5d9073235b5`; 2001 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0934 `libs/monitoring/ports/source-binding-config-protector.port.ts`
- Baseline evidence: blob `fde33eb6788fe1b920e5dd7b9fe8227918e642a4`; 464 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0935 `libs/monitoring/ports/source-binding-repository.port.ts`
- Baseline evidence: blob `2c1a1073c437bd4965aef5e79647bd32943116c1`; 1292 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0936 `libs/monitoring/ports/source-catalog.port.ts`
- Baseline evidence: blob `808c74d7894920a2d66ef1f0a2b914e4cf7edce2`; 854 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0937 `libs/monitoring/ports/source-credential-refresh.port.ts`
- Baseline evidence: blob `013f3c33f9b7fe0fe2ba650be273de899c008155`; 557 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0938 `libs/monitoring/ports/source-credential-repository.port.ts`
- Baseline evidence: blob `fe02d4206e6be2da6df50de8141154df6916a8aa`; 830 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0939 `libs/monitoring/ports/source-credential-resolver.port.ts`
- Baseline evidence: blob `c8db6c5b77e700d2f4d7928e33d1f2e5db1699a6`; 516 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0940 `libs/monitoring/ports/source-credential-vault.port.ts`
- Baseline evidence: blob `4f48fb92981d1ece0a6e0e80cb2fe6c207d1b9c2`; 476 bytes; exact repository path.
- Owner classification: `libs/monitoring`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 0941 `libs/platform/config/src/app-config.ts`
- Baseline evidence: blob `c79d49975df99906aebb41cd701277816568206c`; 1496 bytes; exact repository path.
- Owner classification: `libs/platform/config`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0942 `libs/platform/config/src/index.ts`
- Baseline evidence: blob `74091c8b498dafd3a39a9aac22e418d1761e9c0a`; 65 bytes; exact repository path.
- Owner classification: `libs/platform/config`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0943 `libs/platform/config/src/runtime-profile.ts`
- Baseline evidence: blob `2e73a4a4daaaa55c70e6575570926909c73648b7`; 2744 bytes; exact repository path.
- Owner classification: `libs/platform/config`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0944 `libs/platform/events/src/adapters/in-memory/in-memory-event-adapters.ts`
- Baseline evidence: blob `33c83ad1688915ca6d780e3a2c4a14b351447fec`; 2741 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0945 `libs/platform/events/src/adapters/in-memory/index.ts`
- Baseline evidence: blob `503a4011f0b8b13b8ee095b56f7783fe782b058d`; 44 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0946 `libs/platform/events/src/adapters/prisma/index.ts`
- Baseline evidence: blob `4eac4ed47ffb40b84fa570045d68ddc0d1c5aa77`; 187 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0947 `libs/platform/events/src/adapters/prisma/prisma-event-store-client.ts`
- Baseline evidence: blob `96ff695622f215bd15ee702685890dd57cd66233`; 2536 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0948 `libs/platform/events/src/adapters/prisma/prisma-event-store-connection.ts`
- Baseline evidence: blob `ac59ee4dd7aee96b0d6f8916434c2c1e2a5fb1c6`; 2334 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0949 `libs/platform/events/src/adapters/prisma/prisma-inbox-store.adapter.ts`
- Baseline evidence: blob `0cecdd51693e9668f77594e5c24bfd05f2978328`; 1869 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0950 `libs/platform/events/src/adapters/prisma/prisma-outbox-store.adapter.ts`
- Baseline evidence: blob `13629f6fe77ffb659a84a2cc81d8e60f2dbc0b36`; 4131 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0951 `libs/platform/events/src/adapters/rabbitmq/index.ts`
- Baseline evidence: blob `e375d9ab41bd7a6fd45cd00019a22d1a01f4dd97`; 44 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0952 `libs/platform/events/src/adapters/rabbitmq/rabbitmq-event-publisher.ts`
- Baseline evidence: blob `18244c25be04f2c0bf3b64b392443786073d61a2`; 3159 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0953 `libs/platform/events/src/inbox-deduplicator.ts`
- Baseline evidence: blob `9773e8797881b31ae07f2fba1252639e563f405a`; 977 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0954 `libs/platform/events/src/index.ts`
- Baseline evidence: blob `4832c521b8094ac7058d894db30a61d919c66a28`; 75 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0955 `libs/platform/events/src/outbox-dispatcher.ts`
- Baseline evidence: blob `89cfd3dbb3b3014289d368dee1f522fc6d4038e6`; 1501 bytes; exact repository path.
- Owner classification: `libs/platform/events`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0956 `libs/platform/grpc/src/deadline.ts`
- Baseline evidence: blob `5bd4117848808a6f9a17235bc403166c33ca9576`; 344 bytes; exact repository path.
- Owner classification: `libs/platform/grpc`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0957 `libs/platform/grpc/src/index.ts`
- Baseline evidence: blob `65ccb697fe7b233330d319c107bd1939e863f345`; 82 bytes; exact repository path.
- Owner classification: `libs/platform/grpc`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0958 `libs/platform/grpc/src/metadata.ts`
- Baseline evidence: blob `e4cf0320747bc356cb5b6b1c86dd24209e205d19`; 695 bytes; exact repository path.
- Owner classification: `libs/platform/grpc`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0959 `libs/platform/grpc/src/status.ts`
- Baseline evidence: blob `29ee43127c5a28a6a5e71138354fb8f33e82b876`; 831 bytes; exact repository path.
- Owner classification: `libs/platform/grpc`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0960 `libs/platform/http/src/adapters/guarded-dns.ts`
- Baseline evidence: blob `33007a3299cca0269f75d9ec21aa91825b1659d7`; 2387 bytes; exact repository path.
- Owner classification: `libs/platform/http`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0961 `libs/platform/http/src/index.ts`
- Baseline evidence: blob `850a678842c2b47e1d9b691676209030c4584dd5`; 72 bytes; exact repository path.
- Owner classification: `libs/platform/http`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0962 `libs/platform/http/src/outbound-http-policy-error.ts`
- Baseline evidence: blob `9ae93438e68b4d1cb7bf908597e579fc9dfd5a87`; 257 bytes; exact repository path.
- Owner classification: `libs/platform/http`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0963 `libs/platform/logging/src/index.ts`
- Baseline evidence: blob `471765b257eb82e4492c69fb95f7df66f6bfb604`; 109 bytes; exact repository path.
- Owner classification: `libs/platform/logging`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0964 `libs/platform/logging/src/nest-structured-logger.ts`
- Baseline evidence: blob `3983a19907b862d36e1d6150ea1f2f6da0dd9132`; 659 bytes; exact repository path.
- Owner classification: `libs/platform/logging`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0965 `libs/platform/logging/src/safe-label.ts`
- Baseline evidence: blob `26ed52bc822867096b7dd3ae9ec242a4d7e60dea`; 626 bytes; exact repository path.
- Owner classification: `libs/platform/logging`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0966 `libs/platform/logging/src/structured-logger.ts`
- Baseline evidence: blob `57dabd7688167aed2a41dcaab9db75907db2ab77`; 1222 bytes; exact repository path.
- Owner classification: `libs/platform/logging`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0967 `libs/platform/metrics/src/adapters/opentelemetry-metrics-runtime.ts`
- Baseline evidence: blob `a37368f530ab76e10a28ad31a86457db8da226fb`; 5450 bytes; exact repository path.
- Owner classification: `libs/platform/metrics`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0968 `libs/platform/metrics/src/index.ts`
- Baseline evidence: blob `652c547269ff946002826a61893722292c9e7228`; 113 bytes; exact repository path.
- Owner classification: `libs/platform/metrics`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0969 `libs/platform/metrics/src/metrics-recorder.ts`
- Baseline evidence: blob `813a48c07f451e1775d0205301449b222c2aa821`; 4606 bytes; exact repository path.
- Owner classification: `libs/platform/metrics`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0970 `libs/platform/metrics/src/metrics-runtime-config.ts`
- Baseline evidence: blob `df19c8aecd2267aea650d2f5b323a2db72ab6d1b`; 4904 bytes; exact repository path.
- Owner classification: `libs/platform/metrics`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0971 `libs/platform/metrics/src/metrics-runtime.ts`
- Baseline evidence: blob `ffc1d52b85ae2c983a4867d34b3596a3f1453e01`; 1751 bytes; exact repository path.
- Owner classification: `libs/platform/metrics`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0972 `libs/platform/metrics/src/nest/metrics-runtime.module.ts`
- Baseline evidence: blob `0d6d348f9652b70e5a4273fb2e3ac01b5ec53349`; 2426 bytes; exact repository path.
- Owner classification: `libs/platform/metrics`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0973 `libs/platform/persistence/src/database-access-context.ts`
- Baseline evidence: blob `739c6e2cb0b96f96b9ce00ffdedf014822b0d1b8`; 2677 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0974 `libs/platform/persistence/src/index.ts`
- Baseline evidence: blob `b472acf3c9725be231a0e6b2ca3909f2bdded59e`; 163 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0975 `libs/platform/persistence/src/postgres-runtime-pool-budget-test-fixture.ts`
- Baseline evidence: blob `009a9d725a6acc4e9faabdcb5333ad01f5136b32`; 1153 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0976 `libs/platform/persistence/src/postgres-runtime-pool-budget-test-inventory.ts`
- Baseline evidence: blob `42a31417b4ea5453292cd21f9ac07bfe629c334e`; 11610 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0977 `libs/platform/persistence/src/postgres-runtime-pool-budget-test-source.ts`
- Baseline evidence: blob `095c1678a65e3066184b019b5adac019ec20f114`; 3684 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0978 `libs/platform/persistence/src/postgres-runtime-pool-budget.ts`
- Baseline evidence: blob `6cb9dae17bf57eb816471c01b35ee86ebd3c8f6c`; 17968 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0979 `libs/platform/persistence/src/postgres-runtime-pool-cleanup.ts`
- Baseline evidence: blob `d018d9ac334bd1c908b5b2752356262d6650b33b`; 5613 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0980 `libs/platform/persistence/src/postgres-runtime-pool-commit-ack.spec-support.ts`
- Baseline evidence: blob `73a5ff8147fa4bd65660da5a0ee4cd9a40e7847c`; 1731 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0981 `libs/platform/persistence/src/postgres-runtime-pool-commit-ack.ts`
- Baseline evidence: blob `ab4fb885a408a63b4ed80e8882e01e43ac9aea1c`; 3093 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0982 `libs/platform/persistence/src/postgres-runtime-pool-config.ts`
- Baseline evidence: blob `33fb3cd82cd6d2bd292471aa3f2edf9048f4d2bf`; 8059 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0983 `libs/platform/persistence/src/postgres-runtime-pool-transaction-guard.ts`
- Baseline evidence: blob `658c98c6699d08fef6dad6fd5abeec6a9803d43f`; 14042 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0984 `libs/platform/persistence/src/postgres-runtime-pool.ts`
- Baseline evidence: blob `154725ebd903e230eee57e0b4c9568fc653a0153`; 14272 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0985 `libs/platform/persistence/src/prisma-conversation-client.ts`
- Baseline evidence: blob `23b6b87089d0754bf0cbd4304b941f0cdadf2753`; 4928 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0986 `libs/platform/persistence/src/prisma-database-scope.ts`
- Baseline evidence: blob `4eb2b82c194c9f692050dd7c38c3ec1cda5186ca`; 4434 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0987 `libs/platform/persistence/src/prisma-runtime-client.ts`
- Baseline evidence: blob `dc84200b799e19643d5af7ff1cf3295291e2e06a`; 1949 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0988 `libs/platform/persistence/src/write-retry.ts`
- Baseline evidence: blob `26bdeb2e1f72596a023fbe3921bf534d39b285b6`; 3073 bytes; exact repository path.
- Owner classification: `libs/platform/persistence`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0989 `libs/platform/queue/src/adapters/in-memory/in-memory-queue-command-reader.ts`
- Baseline evidence: blob `2697cde7bf5ffd022790fae4c5b3c78d335f2341`; 469 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0990 `libs/platform/queue/src/adapters/in-memory/in-memory-queue-publisher.ts`
- Baseline evidence: blob `896bdafae160c0bef1c535a6f00741ac18dd3d11`; 2987 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0991 `libs/platform/queue/src/adapters/in-memory/index.ts`
- Baseline evidence: blob `39cb9ab489e74dc907f05c52da516d64dfe6b8a7`; 95 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0992 `libs/platform/queue/src/adapters/prisma/index.ts`
- Baseline evidence: blob `2b4fdd66cfd277399092afcbacb5cfa0a973bf13`; 103 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0993 `libs/platform/queue/src/adapters/prisma/prisma-command-outbox-client.ts`
- Baseline evidence: blob `b3bee4f10219c2f9ea0e1b1a9d2678b06555b9d8`; 2735 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0994 `libs/platform/queue/src/adapters/prisma/prisma-command-outbox-store.adapter.ts`
- Baseline evidence: blob `b8e8d565ab6c6d5edb0453bed9538b7b007b61e4`; 7610 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0995 `libs/platform/queue/src/adapters/rabbitmq/amqplib-rabbitmq-channel.ts`
- Baseline evidence: blob `d00d8a5ee88ed8e169beb5a38fb66569990c36ca`; 8858 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0996 `libs/platform/queue/src/adapters/rabbitmq/index.ts`
- Baseline evidence: blob `489dc0b0128e1be3d25a3b713884637f254d9037`; 231 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0997 `libs/platform/queue/src/adapters/rabbitmq/rabbitmq-publication-tracker.ts`
- Baseline evidence: blob `473658d8ccaf500331218618d7a38c4365dca133`; 3740 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0998 `libs/platform/queue/src/adapters/rabbitmq/rabbitmq-queue-arguments.ts`
- Baseline evidence: blob `863a32fc6541e013436283d9075f5a2ddf4af0b9`; 2670 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 0999 `libs/platform/queue/src/adapters/rabbitmq/rabbitmq-queue-command-reader.ts`
- Baseline evidence: blob `bae310001ad18ba1da09f6e70b027ada371a6005`; 3836 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1000 `libs/platform/queue/src/adapters/rabbitmq/rabbitmq-queue-delivery-reader.ts`
- Baseline evidence: blob `785f04f6ea46860728b073c534a9abc2931ca074`; 5753 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1001 `libs/platform/queue/src/adapters/rabbitmq/rabbitmq-queue-publisher.ts`
- Baseline evidence: blob `8814910941d44bc96899276683901980b0ceb140`; 5998 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1002 `libs/platform/queue/src/adapters/rabbitmq/rabbitmq-queue-reader.spec-support.ts`
- Baseline evidence: blob `232ae3e2ecd33f221bf83cf9cc862ec98c7097fb`; 2221 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1003 `libs/platform/queue/src/command-outbox-dispatcher.ts`
- Baseline evidence: blob `401c407790ef787f743c02083aef7888d5a9a3e4`; 5057 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1004 `libs/platform/queue/src/command-outbox-lease-heartbeat.ts`
- Baseline evidence: blob `75fe74a9d9a8ca65568515e8ba2d0c541818c6b3`; 2693 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1005 `libs/platform/queue/src/index.ts`
- Baseline evidence: blob `a8ac3fca99304806f64df60d60b0393b9b6f6028`; 198 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1006 `libs/platform/queue/src/queue-command.ts`
- Baseline evidence: blob `36d2216aacce87aa6d10683536f784172867859e`; 454 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1007 `libs/platform/queue/src/queue-delivery-batch.ts`
- Baseline evidence: blob `0639da6a3d1b68d16ae1499cce7eb150fa76b2ee`; 2058 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1008 `libs/platform/queue/src/queue-delivery-diagnostics.ts`
- Baseline evidence: blob `7de9acd7d36aeadb6ce4efa3d9896f01cfbf3cbf`; 2774 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1009 `libs/platform/queue/src/queue-delivery.ts`
- Baseline evidence: blob `b209f3162cc5b1150d00da0424eba829f0e3eb1c`; 1073 bytes; exact repository path.
- Owner classification: `libs/platform/queue`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1010 `libs/platform/request-context/src/idempotency-key-header.ts`
- Baseline evidence: blob `79f7788680483f8a269f6eb128d4f708a9568010`; 383 bytes; exact repository path.
- Owner classification: `libs/platform/request-context`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1011 `libs/platform/request-context/src/index.ts`
- Baseline evidence: blob `700aa2137ade7382fcad907b385bdc57a0e8b3df`; 163 bytes; exact repository path.
- Owner classification: `libs/platform/request-context`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1012 `libs/platform/request-context/src/pagination-query.ts`
- Baseline evidence: blob `e8671c277a225834956813359aeb9960074fc459`; 2084 bytes; exact repository path.
- Owner classification: `libs/platform/request-context`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1013 `libs/platform/request-context/src/request-context.ts`
- Baseline evidence: blob `84ee9bcf4cc1772a6bbf08a01d41168a385f789d`; 1431 bytes; exact repository path.
- Owner classification: `libs/platform/request-context`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1014 `libs/platform/request-context/src/request-correlation-id.factory.ts`
- Baseline evidence: blob `6a87473231ddbb44a98acebed4c1a22d4a9e441e`; 1009 bytes; exact repository path.
- Owner classification: `libs/platform/request-context`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1015 `libs/platform/worker/src/index.ts`
- Baseline evidence: blob `973cb5681b16fe5ce1115a2e21c773e620292490`; 120 bytes; exact repository path.
- Owner classification: `libs/platform/worker`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1016 `libs/platform/worker/src/worker-command-id-factory.ts`
- Baseline evidence: blob `ad74b3b30a6960db0a20400777a6c1d45d99c885`; 735 bytes; exact repository path.
- Owner classification: `libs/platform/worker`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1017 `libs/platform/worker/src/worker-runtime.module.ts`
- Baseline evidence: blob `62936c5175c9fd13c8cc6788495587a0aadc8ad8`; 691 bytes; exact repository path.
- Owner classification: `libs/platform/worker`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1018 `libs/platform/worker/src/worker-runtime.ts`
- Baseline evidence: blob `8d91f28362809be7820d8c31a1565220b6247a58`; 6505 bytes; exact repository path.
- Owner classification: `libs/platform/worker`; tentative role: platform; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: contract tests, native adapter lifecycle and cross-app E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1019 `libs/privacy/adapters/retention/json-retention-policy.repository.ts`
- Baseline evidence: blob `8fd7e4ccce18a2d9569097e5f3fabe4d80e0eb4c`; 409 bytes; exact repository path.
- Owner classification: `libs/privacy`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1020 `libs/privacy/features/plan-retention-purge/plan-retention-purge.command.ts`
- Baseline evidence: blob `5920460747c9becd3e389d0081126137e04e47e4`; 111 bytes; exact repository path.
- Owner classification: `libs/privacy`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1021 `libs/privacy/features/plan-retention-purge/plan-retention-purge.result.ts`
- Baseline evidence: blob `b300b34aa53f19519fdc991597d211016e1345c2`; 768 bytes; exact repository path.
- Owner classification: `libs/privacy`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1022 `libs/privacy/features/plan-retention-purge/plan-retention-purge.use-case.ts`
- Baseline evidence: blob `2dbeb445f1d9055d60d9907434e5b0d666dd9686`; 2249 bytes; exact repository path.
- Owner classification: `libs/privacy`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1023 `libs/privacy/ports/index.ts`
- Baseline evidence: blob `85835a081f2d7c7f9f4765608dc2e800a706437d`; 52 bytes; exact repository path.
- Owner classification: `libs/privacy`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1024 `libs/privacy/ports/retention-policy-repository.port.ts`
- Baseline evidence: blob `25a6fe8df63531077e345217a1c952af6745ea75`; 1143 bytes; exact repository path.
- Owner classification: `libs/privacy`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1025 `libs/relevance/adapters/memory/memo-stack-relevance-memory-guidance.reader.ts`
- Baseline evidence: blob `eaeb2121c9648d24313d3f1a339efbce901a7e20`; 7598 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1026 `libs/relevance/adapters/memory/memo-stack-relevance-memory.projector.ts`
- Baseline evidence: blob `8d1f0effe29e2ec8c862de17559f76b0a3cb6676`; 12020 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1027 `libs/relevance/adapters/model/agent-runtime-source-content-quality-reviewer.adapter.ts`
- Baseline evidence: blob `ce13f2d54ec3fd03f367f9da279fef47e28b338e`; 8508 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1028 `libs/relevance/adapters/model/openai-source-content-quality-reviewer.adapter.ts`
- Baseline evidence: blob `1829c0e504eae3f68f5647f55863013395dd0d60`; 7645 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
