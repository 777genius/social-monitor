# Backend source audit index 2 — architecture program 2026-11-23

## Purpose, authority and exclusions

Companion to `2026-11-23-backend-domain-boundary-program.md`; **this appendix is a path inventory, not a requirement to edit every file**. Each listed SHA and byte size originates from the pinned GitHub tree `c0f3ea3dd2f546ab5fd25f395e341cd2c5093541`. Architectural roles are *path-derived candidates*, not manually verified file semantics. Real changes need focused code reading and tests; no production implementation in Stage A.

Entries 1029–2055 of 2055. This index exists to make scope audits and missing-file checks deterministic. Files excluded: Flutter, common generated, tests/spec suffixes, vendor, dist.

## Source-by-source change-control matrix

### 1029 `libs/relevance/adapters/model/promotion-reader-headline-wire.ts`
- Baseline evidence: blob `ef47642520c67317b1bc4af393b4bcb22fc614c8`; 5642 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1030 `libs/relevance/adapters/model/promotion-review-output-bounds.ts`
- Baseline evidence: blob `2e7d8ca8e7e3525edafd8ce6d360c25a67c08a4f`; 249 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1031 `libs/relevance/adapters/model/promotion-review-wire.ts`
- Baseline evidence: blob `617500ae5f9b83b21747277a41b42e651560a8d7`; 7792 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1032 `libs/relevance/adapters/model/source-content-quality-review-wire.ts`
- Baseline evidence: blob `80b3c98fd5e580956b98ea8ab0af711ec3b62527`; 13573 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1033 `libs/relevance/adapters/monitoring/monitoring-configured-interest.reader.ts`
- Baseline evidence: blob `9c56c9882cf575bdc8d198fdd5b84909384ed873`; 1009 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1034 `libs/relevance/adapters/persistence/in-memory-relevance-feedback-learning.store.ts`
- Baseline evidence: blob `d8eeba4f5313b75a1ec0467797a3338a3c4b74aa`; 3665 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1035 `libs/relevance/adapters/persistence/in-memory-relevance-feedback.repository.ts`
- Baseline evidence: blob `2eecfe841a4fd188a84634834ffb6d5d924d3874`; 4157 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1036 `libs/relevance/adapters/persistence/in-memory-relevance-memory-projection.repository.ts`
- Baseline evidence: blob `4d15dfc05490d873b5e0ab1fe965c146cbcb9060`; 1636 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1037 `libs/relevance/adapters/persistence/in-memory-user-relevance-profile.repository.ts`
- Baseline evidence: blob `92b17827801e361fe8612c6942be04b21b0471bc`; 1118 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1038 `libs/relevance/adapters/persistence/prisma/prisma-relevance-client.ts`
- Baseline evidence: blob `0b97f03e7a96df5022cf8f48c98ebbb69c79ba11`; 5562 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1039 `libs/relevance/adapters/persistence/prisma/prisma-relevance-connection.ts`
- Baseline evidence: blob `653e3369360eccddf8c83b9572a135e3a01d63dc`; 2255 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1040 `libs/relevance/adapters/persistence/prisma/prisma-relevance-feedback-learning.store.ts`
- Baseline evidence: blob `d7b401efc1a83150ba0cf9f1a91e723d96e7c026`; 5041 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1041 `libs/relevance/adapters/persistence/prisma/prisma-relevance-feedback.repository.ts`
- Baseline evidence: blob `4cb130ab6289ce8d933f4fe76c85e755dbb19d80`; 4851 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1042 `libs/relevance/adapters/persistence/prisma/prisma-relevance-memory-projection.repository.ts`
- Baseline evidence: blob `f68a48be99f4ff4172120d79f210f95d4f809240`; 3039 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1043 `libs/relevance/adapters/persistence/prisma/prisma-relevance-records.ts`
- Baseline evidence: blob `ac898a59f634c9f19dd15d2a60923e6ffa2afe7e`; 7283 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1044 `libs/relevance/adapters/persistence/prisma/prisma-user-relevance-profile.repository.ts`
- Baseline evidence: blob `f6ad1a08b98a04ef8f14d74616cacb977c720c21`; 1951 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1045 `libs/relevance/application/contracts/reader-value-assessment-store.ts`
- Baseline evidence: blob `fa9366cd6f0bdc3496f2371259b05072aca3b0a5`; 5247 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1046 `libs/relevance/application/contracts/reader-value-existing-assessment.ts`
- Baseline evidence: blob `da4c1a81bc27eb473f7806f45ee55ab573ae10e3`; 321 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1047 `libs/relevance/application/contracts/reader-value-inventory.ts`
- Baseline evidence: blob `46eabfaa651c05a7a22049376659ce4975cf737b`; 3363 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1048 `libs/relevance/application/contracts/reader-value-maintenance-scopes.ts`
- Baseline evidence: blob `298a1e192fad946af5f377a155d1634bdc0357d7`; 594 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1049 `libs/relevance/application/contracts/reader-value-persisted-cost.ts`
- Baseline evidence: blob `2e6daf01f804066eebf2af47402941f5a6f70cac`; 748 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1050 `libs/relevance/application/contracts/reader-value-scoring-configuration.ts`
- Baseline evidence: blob `f68bb660b953bb905b0df8a124d0faccede724c4`; 315 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1051 `libs/relevance/application/contracts/reader-value-summary-preparation.ts`
- Baseline evidence: blob `14125f82ba41275948b0755907354b1e79217786`; 2876 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1052 `libs/relevance/application/contracts/reader-value-workspace-interests.ts`
- Baseline evidence: blob `1f25469377451ce26301b636cbd355823c6722c6`; 329 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1053 `libs/relevance/application/use-cases/assess-reader-value-batch.spec-support.ts`
- Baseline evidence: blob `56c276754ac54c642ad0c0140277c70dc0aeb954`; 1918 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1054 `libs/relevance/application/use-cases/assess-reader-value-batch.use-case.ts`
- Baseline evidence: blob `21ba413f9f34325bf63f90c7b0f20eaf245c9d98`; 5119 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1055 `libs/relevance/application/use-cases/cleanup-reader-value-cache.use-case.ts`
- Baseline evidence: blob `00bb277bb4ac36d52f2ee0fd0fbf75f69928a475`; 1446 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1056 `libs/relevance/application/use-cases/discover-reader-value-batch.use-case.ts`
- Baseline evidence: blob `9a489ed091e501ec424b1dd6e81bf781ae1006aa`; 5126 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1057 `libs/relevance/application/use-cases/prepare-reader-value-summary.use-case.ts`
- Baseline evidence: blob `1661964ea08a33efba9a7480dbd57b4ad51b3c14`; 18988 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1058 `libs/relevance/application/use-cases/run-reader-value-tick.use-case.ts`
- Baseline evidence: blob `934e41d55fe1c19d5869314a98d617011a7177b5`; 6534 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1059 `libs/relevance/domain/entities/post-rating-reason.ts`
- Baseline evidence: blob `7e004d8b7234b1bd052acaa0dd87362b61bb104f`; 712 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1060 `libs/relevance/domain/entities/post-rating.ts`
- Baseline evidence: blob `eaf57052ab6b5871aff66361b54db66ffa3da2bf`; 6667 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1061 `libs/relevance/domain/entities/relevance-feedback-signal.ts`
- Baseline evidence: blob `fdeb409e6c310995fb27ed58aee20f62ba25f56d`; 5344 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1062 `libs/relevance/domain/entities/relevance-memory-projection.ts`
- Baseline evidence: blob `7b185a5612ea08ba53411f58176356e6f996d7a3`; 4607 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1063 `libs/relevance/domain/entities/user-relevance-profile.ts`
- Baseline evidence: blob `05d4f7b0a42370e7e5636435007f5c34ddcaf029`; 7560 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1064 `libs/relevance/domain/index.ts`
- Baseline evidence: blob `7877b7e9004b64ea52ef4639f61e4774b10b3ed8`; 419 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1065 `libs/relevance/domain/policies/ranking-policy.ts`
- Baseline evidence: blob `667ed1f7ad4da72be324bcad12ccb3532e8034b1`; 13067 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1066 `libs/relevance/domain/promotion-reader-headline.ts`
- Baseline evidence: blob `b424e628624bbe9fe0fbbe59fc4ce8130839c18a`; 2229 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1067 `libs/relevance/domain/reader-value/canonical-reader-value-timestamp.ts`
- Baseline evidence: blob `fdd88e2a6b350d5255a6dce50d2bd9b0510e7dc8`; 1356 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1068 `libs/relevance/domain/reader-value/reader-value-assessment.ts`
- Baseline evidence: blob `e48c5702891265a14dddc3b8b6a9e266d6a1e59b`; 3890 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1069 `libs/relevance/domain/reader-value/reader-value-config.ts`
- Baseline evidence: blob `1f349f22d2f4305133fcf2b802aa9f7b9ef51f90`; 635 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1070 `libs/relevance/domain/reader-value/reader-value-failure.ts`
- Baseline evidence: blob `de12b737684d910fadd281ad121c5c2962407fb9`; 1540 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1071 `libs/relevance/domain/reader-value/reader-value-rubric.ts`
- Baseline evidence: blob `6fc0d3229eccec3a9cd40b3721ce376a25d6effe`; 4720 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1072 `libs/relevance/domain/reader-value/reader-value-source-kind.ts`
- Baseline evidence: blob `be6444d3102b4d6a146619ca9d06db416ea0c93a`; 2571 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1073 `libs/relevance/domain/reader-value/reader-value-source.ts`
- Baseline evidence: blob `1816d6319d66d1b756e20807bba6325543b20608`; 2407 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1074 `libs/relevance/domain/source-content-quality-non-x.ts`
- Baseline evidence: blob `049531708e7d8f439fe095df4b94b7944ab92832`; 3124 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1075 `libs/relevance/domain/source-content-quality-normalizer.ts`
- Baseline evidence: blob `acc78fed891be73ac8c21999d3d22551b2e8eda4`; 8980 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1076 `libs/relevance/domain/source-content-quality-topic-context.ts`
- Baseline evidence: blob `a44c6d2463f020728bd02211e44a67e394df3118`; 8277 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1077 `libs/relevance/domain/source-content-quality-verdict.ts`
- Baseline evidence: blob `460dd3497581126b07c6a43c82e6adbefeb09fcd`; 3061 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1078 `libs/relevance/domain/source-content-quality.ts`
- Baseline evidence: blob `45c35c6306b9ac0b420a2023f8976beb85db5cbf`; 9554 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1079 `libs/relevance/domain/source-content-safety.ts`
- Baseline evidence: blob `03c99f8160db9dc31907c5ff729b2b1feb36a1e0`; 5857 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1080 `libs/relevance/features/build-personalized-digest/build-personalized-digest.command.ts`
- Baseline evidence: blob `41ee79c26eab7124be5274a5738b01236c2b62b6`; 357 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1081 `libs/relevance/features/build-personalized-digest/build-personalized-digest.result.ts`
- Baseline evidence: blob `9e9851d90319e7b7b4d30aae52ad5a2aa30c4e04`; 528 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1082 `libs/relevance/features/build-personalized-digest/build-personalized-digest.use-case.ts`
- Baseline evidence: blob `0afe9b37e9fa98c6a4b1d7abee4025e844b55aba`; 2614 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1083 `libs/relevance/features/list-post-ratings/list-post-ratings.query.ts`
- Baseline evidence: blob `9f2809e186d4bf29b2cc3f3ec88cdf1053180b48`; 316 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1084 `libs/relevance/features/list-post-ratings/list-post-ratings.result.ts`
- Baseline evidence: blob `f551aaa7ccfbdd9e33dee1be5075bb6cd45e5a6a`; 158 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1085 `libs/relevance/features/list-post-ratings/list-post-ratings.use-case.ts`
- Baseline evidence: blob `71f3cdf41d0c04f512383ca792ba9fa5d697820b`; 2086 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1086 `libs/relevance/features/project-feedback-to-memory/project-feedback-to-memory.command.ts`
- Baseline evidence: blob `8107973cd4cdff9576f986d24618cc812e1f5025`; 160 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1087 `libs/relevance/features/project-feedback-to-memory/project-feedback-to-memory.result.ts`
- Baseline evidence: blob `325a3d72e4fa840a203f4b03c04b8f3a303657a7`; 157 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1088 `libs/relevance/features/project-feedback-to-memory/project-feedback-to-memory.use-case.ts`
- Baseline evidence: blob `b84a89ef4ee1ece3d717768b9c32259e0867825c`; 849 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1089 `libs/relevance/features/project-relevance-memory/project-relevance-memory-batch.command.ts`
- Baseline evidence: blob `2b1e01ef2a3917bfb05cbdda44e0c63c7867d712`; 227 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1090 `libs/relevance/features/project-relevance-memory/project-relevance-memory-batch.result.ts`
- Baseline evidence: blob `07911f8cf3e51e96f3010d7e01db1db7a66c35f8`; 168 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1091 `libs/relevance/features/project-relevance-memory/project-relevance-memory-batch.use-case.ts`
- Baseline evidence: blob `b7a8a010b9d88f9936efc6cb21af8022e287af7b`; 2587 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1092 `libs/relevance/features/rank-feed-items/promotion-assessment-eligibility.ts`
- Baseline evidence: blob `7d5129dcf0085b9437c49c9e30abfec46f3586a1`; 3249 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1093 `libs/relevance/features/rank-feed-items/promotion-assessment-verdict.ts`
- Baseline evidence: blob `52a5c085504743de3a868f7d0162cdc8aa557e91`; 3985 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1094 `libs/relevance/features/rank-feed-items/promotion-content-assessment.ts`
- Baseline evidence: blob `06273dea3f8d695a8272157c2b4a9b67499ea9f9`; 9786 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1095 `libs/relevance/features/rank-feed-items/promotion-evidence-reference.ts`
- Baseline evidence: blob `c053cf07671697fac36e6b0f498d348333d39d2a`; 1023 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1096 `libs/relevance/features/rank-feed-items/promotion-headline-diagnostic.ts`
- Baseline evidence: blob `06db7d7500d84202bfc3cf14504cadc9c43d1629`; 1023 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1097 `libs/relevance/features/rank-feed-items/promotion-reader-headline-assessment.ts`
- Baseline evidence: blob `97f29ff312f764f313788488ed1103d8ce6a2e48`; 10079 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1098 `libs/relevance/features/rank-feed-items/promotion-snapshot-preparation.ts`
- Baseline evidence: blob `7cccfbaf52fc652f38a8b94bf007a011ba473e3f`; 1941 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1099 `libs/relevance/features/rank-feed-items/rank-feed-item-projection.ts`
- Baseline evidence: blob `9494a47e3e16331deccbe280739e3bc807e1fdca`; 5761 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1100 `libs/relevance/features/rank-feed-items/rank-feed-items.command.ts`
- Baseline evidence: blob `a9292d38694087f51a8ac875d294d63833f03c0a`; 1180 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1101 `libs/relevance/features/rank-feed-items/rank-feed-items.result.ts`
- Baseline evidence: blob `9be7269216265fa2acdb11ba15e75bbc516538c5`; 2285 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1102 `libs/relevance/features/rank-feed-items/rank-feed-items.use-case.spec-support.ts`
- Baseline evidence: blob `1e820ecbf191fc554adbfceb4bf10c683c2f56be`; 7150 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1103 `libs/relevance/features/rank-feed-items/rank-feed-items.use-case.ts`
- Baseline evidence: blob `4780881556ba59499c8ea2d6f2083002ea6bac46`; 13367 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1104 `libs/relevance/features/rank-feed-items/rank-promotion-snapshot.ts`
- Baseline evidence: blob `ca4b717e42fdd8663bd488a60d8052575c9f26ac`; 14245 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1105 `libs/relevance/features/rank-feed-items/rank-promotion-topic-context.spec-support.ts`
- Baseline evidence: blob `ec4241e081f6fafcc3401f55f4e9303ec5c44829`; 6766 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1106 `libs/relevance/features/rank-feed-items/resolve-promotion-interests.ts`
- Baseline evidence: blob `e9cf192f2c925488df068bc1240ddf58cbd66bb1`; 2007 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1107 `libs/relevance/features/rank-feed-items/retained-promotion-candidate-authority.ts`
- Baseline evidence: blob `1552c9d7714d5e02d57f7124c2500c5a7fd6f664`; 1417 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1108 `libs/relevance/features/rank-feed-items/trusted-promotion-topic-context.ts`
- Baseline evidence: blob `bf1e708962033a8ec9029983dfb8b4f55a424513`; 1090 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1109 `libs/relevance/features/record-post-rating/record-post-rating.command.ts`
- Baseline evidence: blob `70faca1b82fb072b3e5c6ea0f32c5c7e6bcabce9`; 473 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1110 `libs/relevance/features/record-post-rating/record-post-rating.result.ts`
- Baseline evidence: blob `53c5e3a94d4daa8338ef3a60297f43a6eb619e42`; 218 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1111 `libs/relevance/features/record-post-rating/record-post-rating.use-case.ts`
- Baseline evidence: blob `b9cbbf3c5ff5c4fda462b6044e61a51366f9ffd2`; 2909 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1112 `libs/relevance/features/record-relevance-feedback/record-relevance-feedback.command.ts`
- Baseline evidence: blob `681ded98ac727f9c9273f6baf981bdf2057468e1`; 460 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1113 `libs/relevance/features/record-relevance-feedback/record-relevance-feedback.result.ts`
- Baseline evidence: blob `3f6de65fb4d97fb67bff8d0598f46329476eb431`; 375 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1114 `libs/relevance/features/record-relevance-feedback/record-relevance-feedback.use-case.ts`
- Baseline evidence: blob `8b3f9690d22c0ad70ded916167c6a461c1117b9b`; 7987 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1115 `libs/relevance/features/shared/relevance-presenter.ts`
- Baseline evidence: blob `a68ff4caad5c5ef2074ba50168b4b0d9df76699b`; 4503 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1116 `libs/relevance/features/upsert-user-relevance-profile/upsert-user-relevance-profile.command.ts`
- Baseline evidence: blob `bbd246b2aa03c7b746f8f06195eb2da61346818e`; 545 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1117 `libs/relevance/features/upsert-user-relevance-profile/upsert-user-relevance-profile.result.ts`
- Baseline evidence: blob `59d7211c6d1f2c597e48243cb05ad72ffa9451a8`; 207 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1118 `libs/relevance/features/upsert-user-relevance-profile/upsert-user-relevance-profile.use-case.ts`
- Baseline evidence: blob `4b68785208725c64224c89e8b8acb61f60de6fb5`; 2215 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1119 `libs/relevance/infrastructure/reader-value/assessment-record.ts`
- Baseline evidence: blob `fffe7efb449690aee436a863215167151a917295`; 2948 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1120 `libs/relevance/infrastructure/reader-value/assessment-sql.ts`
- Baseline evidence: blob `12e7adac913b6c9ad4588c08c1450c99964db5d7`; 5553 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1121 `libs/relevance/infrastructure/reader-value/canonical-postgres-timestamp.ts`
- Baseline evidence: blob `504d12834253ea560a10482e7c29fbe135139016`; 140 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1122 `libs/relevance/infrastructure/reader-value/openai-decisions-reader-value-answers.ts`
- Baseline evidence: blob `60f4e6e6e8c0a5664e8bf1018a461c362c4c3459`; 2209 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1123 `libs/relevance/infrastructure/reader-value/openai-decisions-reader-value-scorer.ts`
- Baseline evidence: blob `7ff5246810cb15a48e70552057a401304df324af`; 4763 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1124 `libs/relevance/infrastructure/reader-value/openrouter-reader-value-scorer.ts`
- Baseline evidence: blob `de3e479bd4b0626a47f71758284f408bf26dffb9`; 5285 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1125 `libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store.ts`
- Baseline evidence: blob `af893d37b880761bdc70b4b79d991421682addd2`; 14657 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1126 `libs/relevance/infrastructure/reader-value/prisma-reader-value-connection.ts`
- Baseline evidence: blob `74dec41a576f6fdcb6411d3e92832aa285b7f38d`; 1115 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1127 `libs/relevance/infrastructure/reader-value/prisma-reader-value-existing-assessment.ts`
- Baseline evidence: blob `76b001cc56e8a859304a973291426e55683af5e8`; 1730 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1128 `libs/relevance/infrastructure/reader-value/prisma-reader-value-inventory.ts`
- Baseline evidence: blob `a0e7729c8fc8601a02b8a13dda3117880eb8f318`; 12183 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1129 `libs/relevance/infrastructure/reader-value/prisma-reader-value-maintenance-scopes.ts`
- Baseline evidence: blob `929967479e441880f39b891e21b02e114c31d27d`; 3273 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1130 `libs/relevance/infrastructure/reader-value/prisma-reader-value-workspace-interests.ts`
- Baseline evidence: blob `ef62561eaa575439d886b91b605a8dc1c0593155`; 1374 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1131 `libs/relevance/infrastructure/reader-value/reader-post-current-assessment-identity.adapter.ts`
- Baseline evidence: blob `bfde989c28810d001642b1b0241fed2975a7b62e`; 2691 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1132 `libs/relevance/infrastructure/reader-value/reader-value-capture.ts`
- Baseline evidence: blob `0a420a7649d0fdf78edae20b230fc80a72fbd809`; 7687 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1133 `libs/relevance/infrastructure/reader-value/reader-value-http-failure.ts`
- Baseline evidence: blob `42ddd1f2bead0f4003fae97be5ce5daa8ca2de0e`; 1984 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1134 `libs/relevance/infrastructure/reader-value/reader-value-input-builder.spec-support.ts`
- Baseline evidence: blob `855533f47b6417c515f772bd74d16d3392019b41`; 1133 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1135 `libs/relevance/infrastructure/reader-value/reader-value-input-builder.ts`
- Baseline evidence: blob `945b1de04190b619266561f4b86b8ebd70fa6f2f`; 4009 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1136 `libs/relevance/infrastructure/reader-value/reader-value-provider-config.ts`
- Baseline evidence: blob `a71a9ee7e058e9eea5e825aa4aa53135f0e1b362`; 1433 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1137 `libs/relevance/infrastructure/reader-value/reader-value-quoted-context.ts`
- Baseline evidence: blob `df30fb137a8d62706c1831f8808fe107de8ac603`; 2791 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1138 `libs/relevance/infrastructure/reader-value/reader-value-request-format.ts`
- Baseline evidence: blob `b37fdb0bb86133a23672e3403c5a8958eadb6afe`; 2888 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1139 `libs/relevance/infrastructure/reader-value/reader-value-request-guard.ts`
- Baseline evidence: blob `d3e699e3a48235480c5c76861c5f722c9aa0f4e7`; 2291 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1140 `libs/relevance/infrastructure/reader-value/reader-value-retained-capture.ts`
- Baseline evidence: blob `04eaab2fd2e00eca2a58a3ef3c579ad1347ba2f1`; 2319 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1141 `libs/relevance/infrastructure/reader-value/reader-value-retention.ts`
- Baseline evidence: blob `53f5f2a9216f253fd6acf9c307b630e2e487df86`; 8460 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1142 `libs/relevance/infrastructure/reader-value/reader-value-source-snapshot.ts`
- Baseline evidence: blob `9b1cca8890048fcc24a68854faa9db8a61959f73`; 6162 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1143 `libs/relevance/interfaces/rest/reader-value-scoring-provider-tokens.ts`
- Baseline evidence: blob `417e2e47aa130874fe6e9493b1a8de08ef462341`; 1528 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1144 `libs/relevance/interfaces/rest/relevance-provider-tokens.ts`
- Baseline evidence: blob `d35a54cd2b0cf17502efb0d64d58cb92e42941ac`; 7115 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1145 `libs/relevance/interfaces/rest/relevance-rest.module.ts`
- Baseline evidence: blob `ef3d033248ca24610be8c1f276adfc9d2f13a8f3`; 13003 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1146 `libs/relevance/interfaces/rest/relevance.controller.ts`
- Baseline evidence: blob `3e5d7a2bed80a9e81db65fbacaf0b8a2b2e52c55`; 16149 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1147 `libs/relevance/interfaces/rest/relevance.dto.ts`
- Baseline evidence: blob `1ab8bfbbc7d8e8d39e4c4ca5113d111c63dcd31d`; 12685 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1148 `libs/relevance/interfaces/rest/source-content-assessment-provider-tokens.ts`
- Baseline evidence: blob `fc9095b481aed988bdbaae9497efc6e3738fae58`; 1995 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1149 `libs/relevance/ports/configured-interest-reader.port.ts`
- Baseline evidence: blob `9ec6645d9a1dec29b635e6ff2c28bafe2336aac8`; 816 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1150 `libs/relevance/ports/index.ts`
- Baseline evidence: blob `afca132f75acb937d9502e28445985ea38dc2930`; 542 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1151 `libs/relevance/ports/post-rating-projection.port.ts`
- Baseline evidence: blob `0263c966fc7e58b088f73a5a461481f00514d636`; 482 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1152 `libs/relevance/ports/post-rating-repository.port.ts`
- Baseline evidence: blob `7ee66d877edd3e31c4006e5662c19ad48cb9042d`; 499 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1153 `libs/relevance/ports/relevance-feedback-learning-store.port.ts`
- Baseline evidence: blob `6c5170f2c8ed68fdf2b4ada54b322c66ea7f3b7e`; 1127 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1154 `libs/relevance/ports/relevance-feedback-repository.port.ts`
- Baseline evidence: blob `a0cf27f88c9ca043416b3a7c33493d4dc03d8220`; 523 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1155 `libs/relevance/ports/relevance-memory-guidance-reader.port.ts`
- Baseline evidence: blob `fa4698b00f362346166b8e603d56d44105183a77`; 1197 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1156 `libs/relevance/ports/relevance-memory-projection-repository.port.ts`
- Baseline evidence: blob `ef6341f8e04d38455b2302f4ecc0872ef7e8c69e`; 565 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1157 `libs/relevance/ports/relevance-memory-projector.port.ts`
- Baseline evidence: blob `1edb8fba977104f32c05a235e770a9743469d1e9`; 876 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1158 `libs/relevance/ports/source-content-quality-reviewer.port.ts`
- Baseline evidence: blob `dcdea3932815485f121627ac696c322dd9235bf5`; 3278 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1159 `libs/relevance/ports/user-relevance-profile-repository.port.ts`
- Baseline evidence: blob `7ce1a8b56713ea7d29182d9132cd1d889b2e46ad`; 506 bytes; exact repository path.
- Owner classification: `libs/relevance`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1160 `libs/shared-kernel/src/clock.ts`
- Baseline evidence: blob `0ba0b326a1010f72c1fc1de1bc8e14f78a742f54`; 297 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1161 `libs/shared-kernel/src/domain-error.ts`
- Baseline evidence: blob `44b26125c6666c420ab376f30d0f4cb1f106618d`; 539 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1162 `libs/shared-kernel/src/event-envelope.ts`
- Baseline evidence: blob `49e0cf6377fb81b2516cde7feabafc06dcc5e8ed`; 476 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1163 `libs/shared-kernel/src/id-generator.ts`
- Baseline evidence: blob `f759aca0c50a2a7b5c317807e863dc5e405ab3b9`; 173 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1164 `libs/shared-kernel/src/ids.ts`
- Baseline evidence: blob `da1bd81de525076fd31dcfcdee19a69f3e658a4a`; 1200 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1165 `libs/shared-kernel/src/index.ts`
- Baseline evidence: blob `0e90f734fa590d9549e1912970a904b8c95f338b`; 387 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1166 `libs/shared-kernel/src/json.ts`
- Baseline evidence: blob `559a8a35d944a9a9264034487130a0942131c784`; 1571 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1167 `libs/shared-kernel/src/outbound-url-policy.ts`
- Baseline evidence: blob `57297368ce17a36cc39a869112e5709871e9617f`; 2881 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1168 `libs/shared-kernel/src/reader-promotion-provider-aliases.ts`
- Baseline evidence: blob `cd1659d5848d4ed125037ff145ee8d9ccf8ad4e9`; 835 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1169 `libs/shared-kernel/src/redaction.ts`
- Baseline evidence: blob `cc5f07a833cf537dc407179c1407bfde6659163c`; 13857 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1170 `libs/shared-kernel/src/result.ts`
- Baseline evidence: blob `e98551b943059fb4973c00e7c198e3e3726c95e1`; 615 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1171 `libs/shared-kernel/src/tenant-scope.ts`
- Baseline evidence: blob `6e61bc7a2ac54ed34535fc1711ad542850a09d18`; 881 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1172 `libs/shared-kernel/src/url-fragment-redaction.ts`
- Baseline evidence: blob `bc0cce6ae54010a43b88d9d6cd2941c568e3af70`; 13664 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1173 `libs/shared-kernel/src/url-query-identity.ts`
- Baseline evidence: blob `3d9ed83767c7d834d0a95a8fa4cf9c9e09ad4289`; 8434 bytes; exact repository path.
- Owner classification: `libs/shared-kernel`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1174 `libs/social-research/application/contracts/social-research-execution-policy.ts`
- Baseline evidence: blob `a1626a9c630651d2a11662cbac3dab89c9ec8790`; 1799 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1175 `libs/social-research/application/contracts/social-research-gateway.ts`
- Baseline evidence: blob `e3cfc14bdb102a4bde72936ba50f803a27f0e275`; 2806 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1176 `libs/social-research/application/social-research-cache-keys.ts`
- Baseline evidence: blob `1ec005f45269a56e69c93b37743f7fcd93eefead`; 3619 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1177 `libs/social-research/application/social-research-execution-policy.ts`
- Baseline evidence: blob `b6b669ba6a560ba052a165aac4757de172a30f3f`; 9049 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1178 `libs/social-research/application/social-research-request-builder.ts`
- Baseline evidence: blob `d581788167403abd719f22c70f32621691e3a00f`; 5130 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1179 `libs/social-research/application/social-research-request.ts`
- Baseline evidence: blob `5e378ec5c053f1dc1ea4a245821d253c38173316`; 5271 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1180 `libs/social-research/application/social-research-sdk-support.ts`
- Baseline evidence: blob `3fad6010fae1007ea13ef35bffcff3485b64030b`; 2871 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1181 `libs/social-research/application/social-research-sdk.ts`
- Baseline evidence: blob `de98d477c1c1cbf5a33a649e09b977c683df60d5`; 12828 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1182 `libs/social-research/application/social-source-discovery.ts`
- Baseline evidence: blob `73d77643bb909a16c96efd64175f8c9a7ab577c0`; 4246 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1183 `libs/social-research/cache.ts`
- Baseline evidence: blob `b59ec009c049ff21299a5c40cdbd3d48e8233993`; 299 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1184 `libs/social-research/contracts.ts`
- Baseline evidence: blob `2f1a65882cd5c5b4a7d0aa3b52b57fc68c85b019`; 775 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1185 `libs/social-research/domain/entities/social-search-item.ts`
- Baseline evidence: blob `37d7baf97e874bf27632316051acea7bcadfbc42`; 1098 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1186 `libs/social-research/domain/policies/social-item-quality-policy.ts`
- Baseline evidence: blob `31e3cc9323d52b1aa46360e5cce8bc7c63b3fb90`; 4303 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1187 `libs/social-research/domain/policies/social-item-ranker.ts`
- Baseline evidence: blob `84160e746fcd4fcdc49295dd1be9a46802304fd0`; 9793 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1188 `libs/social-research/domain/policies/social-query-strategy.ts`
- Baseline evidence: blob `e32408900db201070364c43908fbf80414376e6a`; 7679 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1189 `libs/social-research/domain/policies/social-search-lane-factory.ts`
- Baseline evidence: blob `75b4dce34f0d7c7aaa16d2620413507be0bfc3f4`; 2472 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1190 `libs/social-research/domain/policies/social-search-planner-normalization.ts`
- Baseline evidence: blob `2ce8a028e70fa9517b6421503dce22b1a8f0cfa0`; 3368 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1191 `libs/social-research/domain/policies/social-search-planner.ts`
- Baseline evidence: blob `8ad87e52d2f6a65acc77dae0479cf3212fbfc34b`; 11748 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1192 `libs/social-research/domain/policies/social-source-capability-policy.ts`
- Baseline evidence: blob `fd059f45fdd2d81fe757fb33d7f83e31df257e8e`; 3268 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1193 `libs/social-research/domain/policies/social-source-lane-recipes.ts`
- Baseline evidence: blob `0e7b59c5635864f039c3501fb946a9e73316b19d`; 4336 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1194 `libs/social-research/domain/policies/social-source-lane-strategies.ts`
- Baseline evidence: blob `82852f371de4a5bc889fe4eede50ef085e20082b`; 7342 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1195 `libs/social-research/domain/value-objects/social-search-intent.ts`
- Baseline evidence: blob `7fbd1330c1d8ef827e52127e443853c7aa8a09f1`; 2474 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1196 `libs/social-research/domain/value-objects/social-search-plan.ts`
- Baseline evidence: blob `dcdef481d464c9267f11b508c949b0dfee488a7d`; 4441 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1197 `libs/social-research/domain/value-objects/social-source-capability-profile.ts`
- Baseline evidence: blob `219e8cdd04830d71f794e0d838edec3924486837`; 7070 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1198 `libs/social-research/domain/value-objects/social-source-registry.ts`
- Baseline evidence: blob `b6c9eea6f62dc5efaf8d64124031ea1141820e59`; 8258 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1199 `libs/social-research/grpc.ts`
- Baseline evidence: blob `cf9674c7e2cb43238bddc7859b8641b09e3e17b7`; 64 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1200 `libs/social-research/index.ts`
- Baseline evidence: blob `4bc44ca0952974a3a02512114a4090d1ed6d3850`; 1219 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1201 `libs/social-research/infrastructure/cache/ephemeral-social-research-result-cache.ts`
- Baseline evidence: blob `ea32ee08dfdf896332cdc7f644c446e3b0226e0f`; 2667 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1202 `libs/social-research/infrastructure/cache/prisma-social-research-client.ts`
- Baseline evidence: blob `677ecb88fae9071e83bf7bd61b59f72006ce393e`; 281 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1203 `libs/social-research/infrastructure/cache/prisma-social-research-connection.ts`
- Baseline evidence: blob `2248d751634a582f83b22db0738176b6ed6f55ec`; 1920 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1204 `libs/social-research/infrastructure/cache/prisma-social-research-result-cache.ts`
- Baseline evidence: blob `ced2aacd43fd870b6643b6d4c3392ebde3e4416b`; 6523 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1205 `libs/social-research/infrastructure/cache/social-research-result-cache-payload.ts`
- Baseline evidence: blob `82f8032eca3cbb0dbe53ba6f9c10f5ac290d3cf6`; 1512 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1206 `libs/social-research/infrastructure/ingestion/source-fetcher-lane-execution-compiler.ts`
- Baseline evidence: blob `a5dcc216af50f5151d34a58bacf98635e0935af3`; 10315 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1207 `libs/social-research/infrastructure/ingestion/source-fetcher-lane-execution-support.ts`
- Baseline evidence: blob `e2d4ebfe8796659dceb682410bf487cb349ac87f`; 405 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1208 `libs/social-research/infrastructure/ingestion/source-fetcher-social-research-gateway.ts`
- Baseline evidence: blob `fdd6ebef3d6a843f0e63b1259821eb34be042bda`; 7339 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1209 `libs/social-research/infrastructure/ingestion/source-fetcher-social-research-mappers.ts`
- Baseline evidence: blob `af56f9fc66875ab7ffb71ea4f59b6aff7c248c31`; 2580 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1210 `libs/social-research/infrastructure/ingestion/source-fetcher-social-thread-reader.ts`
- Baseline evidence: blob `bc0fb44d8dea6fec8ab225b8b364f35c3b6954e7`; 3749 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1211 `libs/social-research/infrastructure/ingestion/source-fetcher-x-twitter-lane-execution-compiler.ts`
- Baseline evidence: blob `8d1a7119d878bf4aed1ac1d4f9092e04c988bdb9`; 3716 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1212 `libs/social-research/infrastructure/ingestion/source-provider-capability-profile.mapper.ts`
- Baseline evidence: blob `436496235e13599639f6fbc50f990879f9d1e0bd`; 2217 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1213 `libs/social-research/ingestion.ts`
- Baseline evidence: blob `0023611ee1e3910fb74fe043e9dc16d46f7435f4`; 332 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1214 `libs/social-research/interfaces/contracts/social-research-contract.ts`
- Baseline evidence: blob `418c7b7aff2f8a75290022cf1ca016280916461b`; 5281 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1215 `libs/social-research/interfaces/contracts/social-research-language-sdk-conformance-report.ts`
- Baseline evidence: blob `c57eb127a57d4c26cf4b455d794828a32e2349a2`; 7467 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1216 `libs/social-research/interfaces/contracts/social-research-language-sdk-conformance-suite.ts`
- Baseline evidence: blob `68087c8b275070bc0daf0581dd540e16594f9884`; 8448 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1217 `libs/social-research/interfaces/contracts/social-research-language-sdk-manifest.ts`
- Baseline evidence: blob `5a602dbec263a5a160a98d9cfa78934a8a1a9342`; 6518 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1218 `libs/social-research/interfaces/contracts/social-research-language-sdk-runner-contract.ts`
- Baseline evidence: blob `350745c59750ec12f753d50d392639563e9a0ebe`; 6567 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1219 `libs/social-research/interfaces/contracts/social-research-model-schemas.ts`
- Baseline evidence: blob `7f8c3a49ce54f8bc112d475e4f52425bc6ae28c2`; 16415 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1220 `libs/social-research/interfaces/contracts/social-research-plan-model-schemas.ts`
- Baseline evidence: blob `22ed357c3a0a26de4ed5dfc6c5dd5b745f06f837`; 3859 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1221 `libs/social-research/interfaces/contracts/social-research-sdk-cases.ts`
- Baseline evidence: blob `42357431079a85b26d767bbbbc941b956a6754c3`; 12484 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1222 `libs/social-research/interfaces/contracts/social-research-sdk-conformance.ts`
- Baseline evidence: blob `562c92aa4c492fc09b872ede5f4035fa83740ae0`; 17524 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1223 `libs/social-research/interfaces/contracts/social-research-source-discovery-model-schemas.ts`
- Baseline evidence: blob `1bbada2cb471e76fde2d3199955809f2943e1fe2`; 535 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1224 `libs/social-research/interfaces/contracts/social-research-source-registry-model-schemas.ts`
- Baseline evidence: blob `4b94a3c8d54c9386bba39e78f8592d003921a5f0`; 1451 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1225 `libs/social-research/interfaces/contracts/social-research-source-vocabulary.ts`
- Baseline evidence: blob `b9de7bd15b40740b2d7fa928544146ef8bdc3c46`; 2652 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1226 `libs/social-research/interfaces/contracts/social-research-typescript-sdk-conformance-report.ts`
- Baseline evidence: blob `d4992dcdcf466f1c878583a490862b0438a8cc0f`; 6842 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1227 `libs/social-research/interfaces/grpc/social-research-grpc-adapter.ts`
- Baseline evidence: blob `91985c0ad61853be73b2b46251275577145066b5`; 14742 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1228 `libs/social-research/interfaces/mcp/social-research-mcp-adapter.ts`
- Baseline evidence: blob `84c4ca3d11fa9c79b677daf83311f75fe212d9a0`; 2613 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1229 `libs/social-research/interfaces/rest/social-research-rest.dto.ts`
- Baseline evidence: blob `a7002b244865dfc78235f8c2b98cadb4fc7f5e00`; 8347 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1230 `libs/social-research/interfaces/rest/social-research-rest.module.ts`
- Baseline evidence: blob `2df9034fde4df91595da6d6398e824d615819f51`; 1408 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1231 `libs/social-research/interfaces/rest/social-research.controller.ts`
- Baseline evidence: blob `d3788d0e2c00f64734adaac351b0080fe37fd935`; 10284 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1232 `libs/social-research/interfaces/tools/social-research-tool-handlers.ts`
- Baseline evidence: blob `e84dae8d45d62dc3c75d72eafc91bb88331f8140`; 8330 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1233 `libs/social-research/interfaces/tools/social-research-tool-json-schemas.ts`
- Baseline evidence: blob `448e8efe142a7b8a8a0ec287c92f43e8649ad6cf`; 494 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1234 `libs/social-research/interfaces/tools/social-research-tool-schemas.ts`
- Baseline evidence: blob `5b3494e994e52d21a9b43d04fcee512d1571feb5`; 13872 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1235 `libs/social-research/interfaces/tools/social-research-tool-serializers.ts`
- Baseline evidence: blob `8b11381ffebf10293de1ef641cb8fe05b18362c7`; 2326 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1236 `libs/social-research/mcp.ts`
- Baseline evidence: blob `57a48fda22e3d72475b862841d8d85833546ce45`; 263 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1237 `libs/social-research/rest.ts`
- Baseline evidence: blob `821a49965b7e3446126a2001ab30a37c1a15b165`; 185 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1238 `libs/social-research/tools.ts`
- Baseline evidence: blob `18ac3c6cfa671a08942422d033ed23ea966afd76`; 270 bytes; exact repository path.
- Owner classification: `libs/social-research`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1239 `libs/subscriptions/adapters/monitoring/monitoring-interest-source-provisioner.adapter.ts`
- Baseline evidence: blob `0b95a1f85131c3d470a0876d79ad574e03e856b7`; 7826 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1240 `libs/subscriptions/adapters/persistence/in-memory-source-target.repository.ts`
- Baseline evidence: blob `73813fe5e0e5750b275f1646c28a53751ce28b83`; 1451 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1241 `libs/subscriptions/adapters/persistence/in-memory-user-subscription-schedule.repository.ts`
- Baseline evidence: blob `a53a974fe7e4382dff8efac297d48bcaa84e5381`; 900 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1242 `libs/subscriptions/adapters/persistence/in-memory-user-subscription.repository.ts`
- Baseline evidence: blob `9025fc7554eba96643dca1f98922e7cb7c01472d`; 3077 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1243 `libs/subscriptions/adapters/persistence/in-memory-user-summary-preference.repository.ts`
- Baseline evidence: blob `00ef5b2bb4a93291731bc48c6c25e786192c1e51`; 2305 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1244 `libs/subscriptions/adapters/persistence/prisma/prisma-source-target.repository.ts`
- Baseline evidence: blob `a9bca173bb9f20266184be56e982e69c9a49bdfd`; 2373 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1245 `libs/subscriptions/adapters/persistence/prisma/prisma-subscriptions-client.ts`
- Baseline evidence: blob `d826e6e5da918ba89e4542f1a234659b541473d6`; 5133 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1246 `libs/subscriptions/adapters/persistence/prisma/prisma-subscriptions-connection.ts`
- Baseline evidence: blob `a78f8697915bf321d7ec7fa7e84d93d2c7d8704d`; 2013 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1247 `libs/subscriptions/adapters/persistence/prisma/prisma-subscriptions-records.ts`
- Baseline evidence: blob `79082c16fe999ea604bd3ce09633c215cc0a2f61`; 7695 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1248 `libs/subscriptions/adapters/persistence/prisma/prisma-user-subscription-schedule.repository.ts`
- Baseline evidence: blob `71ce4f4619832999d107062c2a50509defa46c8e`; 2192 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1249 `libs/subscriptions/adapters/persistence/prisma/prisma-user-subscription.repository.ts`
- Baseline evidence: blob `05b841fe38d98040d4a37b32de6eb5e76d130337`; 3715 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1250 `libs/subscriptions/adapters/persistence/prisma/prisma-user-summary-preference.repository.ts`
- Baseline evidence: blob `474eefd3a812e77741e8fc9b8e126c8c430a4a27`; 3723 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1251 `libs/subscriptions/adapters/summary/subscription-user-summary-preference.reader.ts`
- Baseline evidence: blob `54c7c2ae8710444ebb8c2e29e018de6d4f78c993`; 684 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1252 `libs/subscriptions/adapters/target-catalog/static-source-target-catalog.adapter.ts`
- Baseline evidence: blob `ad4774cdb748f86aab01cac5e5e7d220a47f6b89`; 6561 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1253 `libs/subscriptions/domain/entities/source-target.ts`
- Baseline evidence: blob `d79d795cefa3ae818d26674bda0553aad6601e87`; 1951 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1254 `libs/subscriptions/domain/entities/user-subscription-schedule.ts`
- Baseline evidence: blob `463fa16dff56aef6fcea0c1e370c696ad60a7b36`; 2148 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1255 `libs/subscriptions/domain/entities/user-subscription.ts`
- Baseline evidence: blob `7ff486706f0c3f3841d4a44017fcf6b659118a95`; 1773 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1256 `libs/subscriptions/domain/entities/user-summary-preference.ts`
- Baseline evidence: blob `97e1cd56f187181919e295e9b33158fa17fa6eef`; 5178 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1257 `libs/subscriptions/domain/hacker-news-daily-preset-config.ts`
- Baseline evidence: blob `a82c3b27ff42e085df3d150dd1985d4c6f3bf14c`; 1752 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1258 `libs/subscriptions/domain/index.ts`
- Baseline evidence: blob `d7bd684e35ff0e748529ed0d7cd994822b014fa8`; 304 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1259 `libs/subscriptions/domain/reddit-daily-preset-config.ts`
- Baseline evidence: blob `a9459a6274ec3bf36ee4849bc0a7d86323307ef9`; 7639 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1260 `libs/subscriptions/domain/rss-daily-preset-config.ts`
- Baseline evidence: blob `015d7c66af931d16926154c82681709295f0d195`; 1965 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1261 `libs/subscriptions/domain/source-target-presets.ts`
- Baseline evidence: blob `b5188bee782cae5ddb88c3259b8b3d0943cd5e81`; 2742 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1262 `libs/subscriptions/domain/value-objects/user-subscription-preference-types.ts`
- Baseline evidence: blob `4516c4a65ef2935cce3cc37a6cdf01ed01fe8216`; 341 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1263 `libs/subscriptions/domain/x-twitter-daily-preset-config.ts`
- Baseline evidence: blob `25ef067e365fb2e70493ff6442ceb2ef3a764ce8`; 1736 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1264 `libs/subscriptions/features/activate-interest-source/activate-interest-source.command.ts`
- Baseline evidence: blob `980a1559402f54f6f8331f1049a969f77c96180c`; 994 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1265 `libs/subscriptions/features/activate-interest-source/activate-interest-source.result.ts`
- Baseline evidence: blob `00342f9b8d95cde4f09bbe5025031d72c745a913`; 488 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1266 `libs/subscriptions/features/activate-interest-source/activate-interest-source.use-case.ts`
- Baseline evidence: blob `c8c92abd53bf6ea93b0b43e1cb42ac4e4bcc5539`; 2538 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1267 `libs/subscriptions/features/create-user-subscription/create-user-subscription.command.ts`
- Baseline evidence: blob `6cc53bb5c4cd0e0c202f197ebf0cbc7cbe5b9d43`; 1295 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1268 `libs/subscriptions/features/create-user-subscription/create-user-subscription.result.ts`
- Baseline evidence: blob `fdad791c4880d5aae4b2741614389b384d6a1844`; 191 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1269 `libs/subscriptions/features/create-user-subscription/create-user-subscription.use-case.ts`
- Baseline evidence: blob `880f5908b692a370ac03cebf7b8ba6acb19b8a03`; 6149 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1270 `libs/subscriptions/features/get-effective-user-summary-preference/get-effective-user-summary-preference.query.ts`
- Baseline evidence: blob `ce769a2a16e55d8338dc68995e4371455262c541`; 297 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1271 `libs/subscriptions/features/get-effective-user-summary-preference/get-effective-user-summary-preference.result.ts`
- Baseline evidence: blob `8a4cda1867b731808dcd2a2e2622289847d0f02b`; 348 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1272 `libs/subscriptions/features/get-effective-user-summary-preference/get-effective-user-summary-preference.use-case.ts`
- Baseline evidence: blob `ea70d389b89c90e67ca01a6f268a20445301893a`; 2174 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1273 `libs/subscriptions/features/list-user-subscriptions/list-user-subscriptions.query.ts`
- Baseline evidence: blob `bc1841acf5984f75e9d1091c3b0bb9abb9087f9e`; 272 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1274 `libs/subscriptions/features/list-user-subscriptions/list-user-subscriptions.result.ts`
- Baseline evidence: blob `3de16e646ba891893394c01e34e8811aba829986`; 229 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1275 `libs/subscriptions/features/list-user-subscriptions/list-user-subscriptions.use-case.ts`
- Baseline evidence: blob `9e215c984e46013cf0163043b59912d44009021d`; 2978 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1276 `libs/subscriptions/features/shared/subscription-presenter.ts`
- Baseline evidence: blob `b288f03004a4049162cee187c84054c948cc772b`; 2362 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1277 `libs/subscriptions/features/upsert-user-summary-preference/upsert-user-summary-preference.command.ts`
- Baseline evidence: blob `3c2dd728a9a621bced5ace9e9e6e6cb7b7855fc0`; 726 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1278 `libs/subscriptions/features/upsert-user-summary-preference/upsert-user-summary-preference.result.ts`
- Baseline evidence: blob `c009feb3a2e7acaebe876f13307f84db31a42c79`; 223 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1279 `libs/subscriptions/features/upsert-user-summary-preference/upsert-user-summary-preference.use-case.ts`
- Baseline evidence: blob `dfae92910f813ae154635221d65c9882a249ef88`; 5512 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1280 `libs/subscriptions/interfaces/rest/subscriptions-provider-tokens.ts`
- Baseline evidence: blob `b89a1265d5ff4f69801c8b5aea5e7a744b39137b`; 4515 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1281 `libs/subscriptions/interfaces/rest/subscriptions-rest.module.ts`
- Baseline evidence: blob `86a5826a54555f2fdc036ced2b2eeb570a45508c`; 12657 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1282 `libs/subscriptions/interfaces/rest/user-subscriptions.controller.ts`
- Baseline evidence: blob `0e7572a949a6af69ee2697284aa6b37f08d3bd2e`; 13864 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1283 `libs/subscriptions/interfaces/rest/user-subscriptions.dto.ts`
- Baseline evidence: blob `94b007e1a0d633e70afee656b2062ddcb792c229`; 6093 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1284 `libs/subscriptions/interfaces/rest/user-summary-preferences.controller.ts`
- Baseline evidence: blob `d3f561d54b7748edb5cb864fd81eeab377285a1e`; 8254 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1285 `libs/subscriptions/ports/index.ts`
- Baseline evidence: blob `251d517140934f5c1e5c5df83da8b73511d2f5b3`; 386 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1286 `libs/subscriptions/ports/interest-source-provisioner.port.ts`
- Baseline evidence: blob `b464416f8423703cbb513e0752b3e9022afbbb40`; 1164 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1287 `libs/subscriptions/ports/source-target-catalog.port.ts`
- Baseline evidence: blob `680d508b01e5286568598954ac0ee823b02c6592`; 721 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1288 `libs/subscriptions/ports/source-target-repository.port.ts`
- Baseline evidence: blob `86a47034030ef87c43a1bc8fcbd9cb7b1472346b`; 673 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1289 `libs/subscriptions/ports/user-subscription-repository.port.ts`
- Baseline evidence: blob `cafab67fb716cf46d11fdd1ca6fed421bc6e5c72`; 1034 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1290 `libs/subscriptions/ports/user-subscription-schedule-repository.port.ts`
- Baseline evidence: blob `c6d5db6ad1c9a0c26a50a7ed4541e9e251863830`; 444 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1291 `libs/subscriptions/ports/user-summary-preference-memory-projector.port.ts`
- Baseline evidence: blob `f30157ea35708c576875929feb8a4c671e7e32fb`; 1615 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1292 `libs/subscriptions/ports/user-summary-preference-repository.port.ts`
- Baseline evidence: blob `0e0f76dd5faa43a653559e8d10145700c68b9e05`; 912 bytes; exact repository path.
- Owner classification: `libs/subscriptions`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1293 `libs/summary/adapters/composition/gateway-model-task.spec-support.ts`
- Baseline evidence: blob `14fc106d706779d43d564651b5bc0d4705ae70f3`; 2958 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1294 `libs/summary/adapters/composition/reader-summary-agent-runtime-transport.ts`
- Baseline evidence: blob `7432a1be44246773442e10df924c52b66cf10e55`; 13335 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1295 `libs/summary/adapters/composition/reader-summary-usage-log.ts`
- Baseline evidence: blob `719c73356d71091826d07f6be6b2b820d582d395`; 3030 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1296 `libs/summary/adapters/composition/reader-summary-usage-scope.ts`
- Baseline evidence: blob `e5ed9e605a994545f2ee06a213f93ab407ead4ec`; 684 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1297 `libs/summary/adapters/composition/reader-summary-v3-composition.ts`
- Baseline evidence: blob `2f4ec937115133f5102899fcdbf54725f8e78aa8`; 4210 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1298 `libs/summary/adapters/context/reader-summary-artifact-context.provider.ts`
- Baseline evidence: blob `19027eccb90dc839873faba5136581d8d6f9a58b`; 2828 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1299 `libs/summary/adapters/eval/static-summary-eval.fixtures.ts`
- Baseline evidence: blob `3b7b36645194e29479fa241a4801bcef58d389a4`; 12072 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1300 `libs/summary/adapters/eval/story-relation-golden-harness.ts`
- Baseline evidence: blob `970825fc02bf9c2b03d5c4de26367e754c75da08`; 4196 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1301 `libs/summary/adapters/eval/story-relation-golden.fixtures.ts`
- Baseline evidence: blob `abdc5fac93c3ad8a9cd678caec898efef860a7f9`; 4020 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1302 `libs/summary/adapters/eval/story-relation-golden.transcripts.ts`
- Baseline evidence: blob `f79f47fd9c5561623b8c626db69f58206de23f14`; 4987 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1303 `libs/summary/adapters/evidence/conversation-evidence-context.reader.ts`
- Baseline evidence: blob `3c93b8c0d0f4c0c1784c6f93c02be23e7b5ad027`; 6846 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1304 `libs/summary/adapters/evidence/conversation-reader-summary-evidence.selector.ts`
- Baseline evidence: blob `bfd4fff235c0c539a728fae51eaee466844bb7cf`; 1992 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1305 `libs/summary/adapters/evidence/conversation-summary-evidence.selector.ts`
- Baseline evidence: blob `17be5b4b549f8ff2c410ae0c8ad74caacc4efe8d`; 2144 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1306 `libs/summary/adapters/evidence/empty-summary-evidence.selector.ts`
- Baseline evidence: blob `bce78861f5cae829b14d2d24bd4aa18a85a3002d`; 733 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1307 `libs/summary/adapters/evidence/feed-item-collection-stats.ts`
- Baseline evidence: blob `166cf067aa79e704dd1be11fe63a134bf71b7f63`; 3054 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1308 `libs/summary/adapters/evidence/feed-reader-summary-coverage-ownership.spec-support.ts`
- Baseline evidence: blob `17140d0287663ea1afb215df54963731461b5464`; 8740 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1309 `libs/summary/adapters/evidence/feed-reader-summary-coverage.counter.ts`
- Baseline evidence: blob `f920deeec016315880a63240b0a000f23ac6f7bd`; 10262 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1310 `libs/summary/adapters/evidence/feed-reader-summary-freshness.probe.ts`
- Baseline evidence: blob `f83c16d6945f420b6ff9d27db77c39c0ed981d1e`; 1579 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1311 `libs/summary/adapters/evidence/feed-reader-summary-preview-media.enricher.ts`
- Baseline evidence: blob `7a1f9950631aa09a5ef4d1fcc63cb849e4f91f2b`; 4226 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1312 `libs/summary/adapters/evidence/feed-reader-summary-topic-collection-metrics.reader.ts`
- Baseline evidence: blob `c602fefd0f99ba0216b789d12ddb4360c9f94807`; 5288 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1313 `libs/summary/adapters/evidence/feed-summary-evidence.selector.ts`
- Baseline evidence: blob `d68dc4779cefc21e23a373c2d613085934419cdd`; 4831 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1314 `libs/summary/adapters/evidence/feed-summary-freshness.probe.ts`
- Baseline evidence: blob `e228c8748828e777d7384be24c8beb5a5a144cc1`; 1189 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1315 `libs/summary/adapters/evidence/jev-reader-summary-candidate-qualification.ts`
- Baseline evidence: blob `7eb5c4d77d8cfbea923e4ab7d2dbedc5f1cc1722`; 7359 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1316 `libs/summary/adapters/evidence/provider-preview-media.ts`
- Baseline evidence: blob `4878fae7e29da75cb2c878a122f3816c12588ebc`; 5714 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1317 `libs/summary/adapters/evidence/reader-browse-source-engagement.ts`
- Baseline evidence: blob `c5c5b87a537ebf703e39de778079acf811b0d650`; 3521 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1318 `libs/summary/adapters/evidence/reader-headline.spec-support.ts`
- Baseline evidence: blob `7187504aa587479f89f609860b0ea62e2027790a`; 2144 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1319 `libs/summary/adapters/evidence/reader-post-promotion-engagement-facts.ts`
- Baseline evidence: blob `8cb3f1a9581d16c99e1423096b87e13876d662df`; 2833 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1320 `libs/summary/adapters/evidence/reader-post-promotion-facts.ts`
- Baseline evidence: blob `276f22a8a98adc182756d38879e9f72219646133`; 8894 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1321 `libs/summary/adapters/evidence/reader-summary-daily-generation-evidence.ts`
- Baseline evidence: blob `69712f6b4a2c78c150dfe7b445378fb61c2a746d`; 7166 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1322 `libs/summary/adapters/evidence/reader-summary-display-ready-candidates.ts`
- Baseline evidence: blob `85a217f4c3073750430c1bba1fd6a7d5872a7330`; 958 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1323 `libs/summary/adapters/evidence/reader-summary-display-ready-ranking.spec-support.ts`
- Baseline evidence: blob `9fbe18fbf7dedbfa21a07602d3a4e91b0b621243`; 799 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1324 `libs/summary/adapters/evidence/reader-summary-editorial-candidate.ts`
- Baseline evidence: blob `7213b50219f552655407b3817050da7867211daf`; 8175 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1325 `libs/summary/adapters/evidence/reader-summary-editorial-slate.spec-support.ts`
- Baseline evidence: blob `3f7927ae5d392a7a8511dfb290d7f6836b4ca365`; 4366 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1326 `libs/summary/adapters/evidence/reader-summary-editorial-slate.ts`
- Baseline evidence: blob `b648468385cdeb3006f48cfc85785518c467662d`; 18026 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1327 `libs/summary/adapters/evidence/reader-summary-evidence-provider-filter.ts`
- Baseline evidence: blob `209a812788ef131402dff86273255f493600d368`; 272 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1328 `libs/summary/adapters/evidence/reader-summary-faithful-source-transport.spec-support.ts`
- Baseline evidence: blob `7ccc0901109646bbeb2234fd10635c33fc2b4329`; 1516 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1329 `libs/summary/adapters/evidence/reader-summary-faithful-source.spec-support.ts`
- Baseline evidence: blob `f4bc379d3eda5a676fd93cfd00970f8d6cd581f0`; 2422 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1330 `libs/summary/adapters/evidence/reader-summary-preparation-observer.ts`
- Baseline evidence: blob `af24333c3b297cac2486bc62f3d19b07ff5d9ccb`; 3881 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1331 `libs/summary/adapters/evidence/reader-summary-provider-evidence.ts`
- Baseline evidence: blob `3c7f232c62d94ba1646235e2cb8cdd2669731f36`; 5119 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1332 `libs/summary/adapters/evidence/relevance-reader-summary-evidence-normalization.ts`
- Baseline evidence: blob `670c2ec65ead9984f995cba69d045426987a20c7`; 971 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1333 `libs/summary/adapters/evidence/relevance-reader-summary-evidence-support.ts`
- Baseline evidence: blob `0a2214c3796d31e2409ca3ab505f3a771f81d996`; 15946 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1334 `libs/summary/adapters/evidence/relevance-reader-summary-evidence-test-fixtures.ts`
- Baseline evidence: blob `0e56fc7c2fa763a5ea42bf0583f10c081a3721e5`; 4431 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1335 `libs/summary/adapters/evidence/relevance-reader-summary-evidence.selector.ts`
- Baseline evidence: blob `028b685b89f7014945746dad17d7ed44c3fc3892`; 15345 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1336 `libs/summary/adapters/evidence/relevance-reader-summary-promotion-candidates.ts`
- Baseline evidence: blob `5ae4c4037ad27bc1414745d131aeb07230819dd6`; 5663 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1337 `libs/summary/adapters/evidence/relevance-reader-summary-related-topics.ts`
- Baseline evidence: blob `8b7605cd1b2e09bba18440a317a14319f25d60a8`; 3851 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1338 `libs/summary/adapters/evidence/relevance-reader-summary-story-relation-decisions.ts`
- Baseline evidence: blob `80b3bb5a51f886fd85f6986dbbb411749083be62`; 12787 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1339 `libs/summary/adapters/evidence/relevance-reader-summary-top-read-reserve.ts`
- Baseline evidence: blob `f1c78535270e0053bb62c475c89c5ec16e15b24c`; 2624 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1340 `libs/summary/adapters/evidence/relevance-reader-summary-v3-evidence.ts`
- Baseline evidence: blob `7a5355edcd904ab2cf072eb363283ac0a638cc06`; 3079 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1341 `libs/summary/adapters/evidence/relevance-reader-summary-v3-news-relations.ts`
- Baseline evidence: blob `98dbc6e93baed7fb2237d27636b3637d27e4e00a`; 3828 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1342 `libs/summary/adapters/evidence/relevance-reader-summary-v3-preparation-source.ts`
- Baseline evidence: blob `bc16ccd9fc35f7535f4bda5c83504a3d252a792c`; 12043 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1343 `libs/summary/adapters/evidence/relevance-reader-summary-v3-presentation-runtime-guard.ts`
- Baseline evidence: blob `04b9296104185a805334af9522fc21a13d40de4b`; 5371 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1344 `libs/summary/adapters/evidence/relevance-reader-summary-v3-presentation-slate.ts`
- Baseline evidence: blob `8fa4ad828858de0fd8f20f78c84acd83400f109e`; 3249 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1345 `libs/summary/adapters/evidence/relevance-reader-summary-v3-promotion.fixture.ts`
- Baseline evidence: blob `6554abcd2e617930bcd1b29ac644196f4f4c3d3e`; 13519 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1346 `libs/summary/adapters/evidence/relevance-reader-summary-v3-promotion.ts`
- Baseline evidence: blob `88c42fc9266f0e040cc40fdeec97f1d5cf467439`; 25693 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1347 `libs/summary/adapters/evidence/relevance-reader-summary-v3-source-evidence.ts`
- Baseline evidence: blob `a5acf1b7dab8e028b74af5a6c50d33e2b9e2ce0c`; 2472 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1348 `libs/summary/adapters/evidence/relevance-reader-summary-v3-story-relations.ts`
- Baseline evidence: blob `c6163c8bbc026a2e44cb09b6a2241499825ffeba`; 9364 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1349 `libs/summary/adapters/evidence/relevance-summary-evidence.selector.ts`
- Baseline evidence: blob `af499ce91e598bd3325ee3f79ebc7a596f55b923`; 3279 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1350 `libs/summary/adapters/evidence/static-reader-summary-freshness.probe.ts`
- Baseline evidence: blob `8ebe273d8c25cf4a7145dabd55ecf60d4fc5ecda`; 438 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1351 `libs/summary/adapters/evidence/youtube-video-summary-evidence.selector.ts`
- Baseline evidence: blob `70c8acd7c66479bea650c8fc160a1d9f538f4e70`; 4511 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1352 `libs/summary/adapters/memory/memo-stack-memory-client.ts`
- Baseline evidence: blob `29dec392845d643501f18eda2fe64f2d3a50aaf1`; 4351 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1353 `libs/summary/adapters/memory/memo-stack-summary-feedback-memory.ts`
- Baseline evidence: blob `6c6b072c7805349f37c0441980664e26d44b12a2`; 8959 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1354 `libs/summary/adapters/memory/memo-stack-summary-memory-context-merge.ts`
- Baseline evidence: blob `8779ac628975de9436fe070dc96bc8a1daa88987`; 5871 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1355 `libs/summary/adapters/memory/memo-stack-summary-memory.adapter.ts`
- Baseline evidence: blob `d087f99430cab07bb1ac6d1d0ac1b4e75981cf95`; 20747 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1356 `libs/summary/adapters/memory/memo-stack-user-summary-preference-memory.projector.ts`
- Baseline evidence: blob `380820ff93e474a5d780b6958acce61d03a809ad`; 6259 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1357 `libs/summary/adapters/memory/noop-summary-memory.adapter.ts`
- Baseline evidence: blob `acf10bc6b6faebe6f06e520a2238c8f8e8d69902`; 751 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1358 `libs/summary/adapters/memory/summary-memory-reader-summary-context.provider.ts`
- Baseline evidence: blob `de8280e8cb373a9b36d46215eb857ba467d6aa3e`; 3801 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1359 `libs/summary/adapters/messaging/in-memory-summary-event-publisher.ts`
- Baseline evidence: blob `28bd004e467a40f06558a7ad329ffecdf72a46af`; 529 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1360 `libs/summary/adapters/messaging/in-memory-summary-job-queue.adapter.ts`
- Baseline evidence: blob `b6f5a27b5c0e395eb60d1a7c5f8366d7057259b1`; 2787 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1361 `libs/summary/adapters/messaging/reader-summary-job-queue.adapter.ts`
- Baseline evidence: blob `879de1c674bfd1852d8e810df6b827cbb5b9ea01`; 3566 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1362 `libs/summary/adapters/metrics/reader-summary-promotion-metrics.recorder.ts`
- Baseline evidence: blob `ad299af6c4c6e5e607f04d97ccc719f06fd0b2fa`; 1166 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1363 `libs/summary/adapters/metrics/story-ranking-metrics.recorder.ts`
- Baseline evidence: blob `9c67fdd0c171c79b3a5efba5d04c1a2514efc127`; 7559 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1364 `libs/summary/adapters/model/active-reader-summary-generation-profile.ts`
- Baseline evidence: blob `7a69e2931334a1efb1151e230b9c726dc40211c7`; 19924 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1365 `libs/summary/adapters/model/agent-runtime-model-support.ts`
- Baseline evidence: blob `f5cf894218af48b831af688ae3b40a41b911bdbf`; 7966 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1366 `libs/summary/adapters/model/agent-runtime-promotion-presentation-v3-runtime-failure.ts`
- Baseline evidence: blob `b9bc17d0e8ed09e14bfdd54232c987004cb1b79b`; 5587 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1367 `libs/summary/adapters/model/agent-runtime-promotion-presentation-v3.builder.ts`
- Baseline evidence: blob `fe928ee3957e2e1be1f1227b48ad819f870eddb9`; 25665 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1368 `libs/summary/adapters/model/agent-runtime-reader-summary-daily-editorial.ts`
- Baseline evidence: blob `115f092ae097950a7290c16004a835a1a9b716d2`; 3637 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1369 `libs/summary/adapters/model/agent-runtime-reader-summary-model.adapter.ts`
- Baseline evidence: blob `4ba707df1c607bd163baaf4370fec5d1e06a5306`; 18607 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1370 `libs/summary/adapters/model/agent-runtime-reader-summary-model.spec-support.ts`
- Baseline evidence: blob `a80e811bb6fa4c71b11f7134286f5c47ac81efcd`; 6230 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1371 `libs/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier-prompt.ts`
- Baseline evidence: blob `276fc7d83fcf5ff3b34d170b4a12259f7135ca5b`; 10580 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1372 `libs/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter.ts`
- Baseline evidence: blob `a83d564be190411033eb99fd9dd9a2fb77920ce9`; 12930 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1373 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-candidate-selection.ts`
- Baseline evidence: blob `3f54f62213f1c261f2b4f6b9774025f19c10d26d`; 3223 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1374 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-cohort-completion.ts`
- Baseline evidence: blob `c111c24402ebba91634cd346fdd949dee44a5a13`; 3978 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1375 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-evidence-prompt.ts`
- Baseline evidence: blob `00d042b82eac8528c92826b82442413ad097a08a`; 1882 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1376 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-grounded-cohorts.ts`
- Baseline evidence: blob `ed573436217ee7ee1e8b2a21d7045dd97f7a9b5f`; 3872 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1377 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-group-recovery.ts`
- Baseline evidence: blob `30a2d4df6ff70684f4ac5bbd021dda4766ed6a4c`; 11577 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1378 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-integrity.spec-support.ts`
- Baseline evidence: blob `5fc23d4aaf9b0eb21a4c10cb36a79901c3ea6131`; 3942 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1379 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-label-plan-normalizer.ts`
- Baseline evidence: blob `8309a77d8e34395ffb900a04e2b69cbd0d8564f5`; 13199 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1380 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-labeler-prompt.ts`
- Baseline evidence: blob `5ac41af7bf5c5d70f53fd1e08cda40c548789556`; 14680 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1381 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-labeler.adapter.ts`
- Baseline evidence: blob `25ace69699d86411da9f30687c035a927e8c337d`; 9670 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1382 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-publication.spec-support.ts`
- Baseline evidence: blob `1121cf349eb284544caabe212e7e5cd2f97f659e`; 3687 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1383 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-relation-verifier-prompt.ts`
- Baseline evidence: blob `5605d2c49ed57082055842f46fb408732c2aa313`; 4108 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1384 `libs/summary/adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter.ts`
- Baseline evidence: blob `b15f316bc7dd14a243a4ab775efd057553060a0d`; 10036 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1385 `libs/summary/adapters/model/agent-runtime-summary-model.adapter.ts`
- Baseline evidence: blob `be412753d82573557f7b19c170457966dc8e65dd`; 11342 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1386 `libs/summary/adapters/model/codex-reader-summary-route.ts`
- Baseline evidence: blob `734d35b8908b8aa2b60751e1dfd7d778f5cbe1df`; 3932 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1387 `libs/summary/adapters/model/deterministic-reader-summary-evidence-selection.ts`
- Baseline evidence: blob `0e36ceaa7638b10fd227831cc0a89c2371cb9136`; 3207 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1388 `libs/summary/adapters/model/deterministic-reader-summary-headline.ts`
- Baseline evidence: blob `d339101eb489ea87d57e079fa41f2368c7799717`; 989 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1389 `libs/summary/adapters/model/deterministic-reader-summary-model.adapter.ts`
- Baseline evidence: blob `5b8bec7d9c4124bf3f5442a2af1d83c6fa8294d6`; 14792 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1390 `libs/summary/adapters/model/deterministic-reader-summary-model.spec-support.ts`
- Baseline evidence: blob `c491b2e8ac8078d96815e362f0c0932f21a50ee3`; 1483 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1391 `libs/summary/adapters/model/deterministic-reader-summary-narrative.ts`
- Baseline evidence: blob `e131f0dc2235a9be89e8867d1d1e28e3127cb33a`; 5646 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1392 `libs/summary/adapters/model/deterministic-summary-headline.ts`
- Baseline evidence: blob `9daf7a66d5a3400cdf9d1c8c84238d6fdec45663`; 805 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1393 `libs/summary/adapters/model/deterministic-summary-model.adapter.ts`
- Baseline evidence: blob `06d75bb867760488cb62430d1d4221900644512d`; 10308 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1394 `libs/summary/adapters/model/gateway-llm/gateway-llm-account-selector.ts`
- Baseline evidence: blob `d794d5d4efc159a199f940614d1633c12c2a2ace`; 3381 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1395 `libs/summary/adapters/model/gateway-llm/gateway-llm-attempts.ts`
- Baseline evidence: blob `56bdae87a9e12b83dbf1948f4b7b48c07079a897`; 2159 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1396 `libs/summary/adapters/model/gateway-llm/gateway-llm-client.ts`
- Baseline evidence: blob `ba74b4e0300eeb6cb87e17a65e352cf5a7646c89`; 13269 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1397 `libs/summary/adapters/model/gateway-llm/gateway-llm-deadline.ts`
- Baseline evidence: blob `34be7f1ffbc0ed6d67b11d7e7756f67568126140`; 544 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1398 `libs/summary/adapters/model/gateway-llm/gateway-llm-failure.ts`
- Baseline evidence: blob `233576d466064f8bc99d2090a1f03edf01dd307c`; 6187 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1399 `libs/summary/adapters/model/gateway-llm/gateway-llm-output-budget.ts`
- Baseline evidence: blob `4f6e0e38d010337eb73e9c6871b46f34322bc513`; 515 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1400 `libs/summary/adapters/model/gateway-llm/gateway-llm-output-schema.ts`
- Baseline evidence: blob `b46c9c329636f2ae833dbf19527ec1c2552588d5`; 4898 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1401 `libs/summary/adapters/model/gateway-llm/gateway-llm-output-violations.ts`
- Baseline evidence: blob `7c7f11b59beae95fd1728b21101291fdc8a57b3b`; 5937 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1402 `libs/summary/adapters/model/gateway-llm/gateway-llm-request-identity.ts`
- Baseline evidence: blob `65519eec06cdc595a5859980360f3651a09fe7e1`; 1361 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1403 `libs/summary/adapters/model/gateway-llm/gateway-llm-schema-limits.ts`
- Baseline evidence: blob `b3a3f20568047754aaa0d6da1f752017562b75b2`; 4100 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1404 `libs/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity.ts`
- Baseline evidence: blob `404d1ca88af730952cc387a8cf0b912c13c9cdea`; 913 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1405 `libs/summary/adapters/model/grpc-agent-runtime-client.ts`
- Baseline evidence: blob `427fac65ea3cf475c6a13508415ad942b3a41924`; 13991 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1406 `libs/summary/adapters/model/metered-reader-summary-model.adapter.ts`
- Baseline evidence: blob `3a0be096537034cbd750bd87a2bf7c1b46c99715`; 4406 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1407 `libs/summary/adapters/model/metered-summary-model.adapter.ts`
- Baseline evidence: blob `8d7648ba278dbb5c06d21ce98a2a97003a5a46cc`; 2778 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1408 `libs/summary/adapters/model/openai-api-key-source.ts`
- Baseline evidence: blob `0657d826bddc9e57a602092c95df9b5259be2a88`; 909 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1409 `libs/summary/adapters/model/openai-promotion-presentation-v3.builder.ts`
- Baseline evidence: blob `b5e1b107ee6c0f8ac385dbef4ef1d9decc1367a3`; 11900 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1410 `libs/summary/adapters/model/openai-responses-reader-summary-adaptive-evidence.ts`
- Baseline evidence: blob `047343f9c5065a3c92a2b52b48979214d5769b64`; 11920 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1411 `libs/summary/adapters/model/openai-responses-reader-summary-content-support.ts`
- Baseline evidence: blob `34a6599ca9d7d569154812b7c5392cbd027d56f7`; 9117 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1412 `libs/summary/adapters/model/openai-responses-reader-summary-contract.ts`
- Baseline evidence: blob `dba2b292dad2103862c2c7d659c5e3c72beb93cf`; 934 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1413 `libs/summary/adapters/model/openai-responses-reader-summary-daily-editor.ts`
- Baseline evidence: blob `e30b69367d4bf185b48ac91ccef781ef393221f2`; 3052 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1414 `libs/summary/adapters/model/openai-responses-reader-summary-draft-normalizer.ts`
- Baseline evidence: blob `5922c0c2a600983cbc0a3f39d04c942e1557eed1`; 12930 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1415 `libs/summary/adapters/model/openai-responses-reader-summary-editorial-narrative.ts`
- Baseline evidence: blob `676d63e00d790bd52f7e41bd624182cd7bfefcc6`; 5175 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1416 `libs/summary/adapters/model/openai-responses-reader-summary-http.ts`
- Baseline evidence: blob `8f9b1f91586b95fdb8d74de664f2c427efcbdb26`; 1375 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1417 `libs/summary/adapters/model/openai-responses-reader-summary-json-schema.ts`
- Baseline evidence: blob `73b0f4dcf09dc84833783596a416855f85f677cc`; 5908 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1418 `libs/summary/adapters/model/openai-responses-reader-summary-json.ts`
- Baseline evidence: blob `0b0fd8f23f92f690c910ff830404be74269ab87f`; 2843 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1419 `libs/summary/adapters/model/openai-responses-reader-summary-model-support.ts`
- Baseline evidence: blob `1dbe679f3ebaf0cbbeffea9bedf090f1770fc0f6`; 717 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1420 `libs/summary/adapters/model/openai-responses-reader-summary-model.adapter.ts`
- Baseline evidence: blob `7cc1652c9071aa16a265e010043c264d358c828e`; 14707 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1421 `libs/summary/adapters/model/openai-responses-reader-summary-narrative-coverage.ts`
- Baseline evidence: blob `69983945f34faa651a7c0d5729ea2ffe6f5be566`; 3029 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1422 `libs/summary/adapters/model/openai-responses-reader-summary-narrative.ts`
- Baseline evidence: blob `9522a33ca3f80b1057eea5069015672c3dfffd8c`; 16177 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1423 `libs/summary/adapters/model/openai-responses-reader-summary-options.ts`
- Baseline evidence: blob `ac71662a36c6172b9d614d451a31c92def77fbda`; 2186 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1424 `libs/summary/adapters/model/openai-responses-reader-summary-parsers.ts`
- Baseline evidence: blob `e1e77940990fa4e93fe02ffa0144765c833c14c2`; 2164 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1425 `libs/summary/adapters/model/openai-responses-reader-summary-prompt.ts`
- Baseline evidence: blob `5cf4fe16df33e9e0aa4c33a41c93fb0eaed7b154`; 28254 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1426 `libs/summary/adapters/model/openai-responses-reader-summary-response-parser.ts`
- Baseline evidence: blob `0247efea9d675e546fdc8d1b23eed962d967c551`; 2796 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1427 `libs/summary/adapters/model/openai-responses-reader-summary-schema.ts`
- Baseline evidence: blob `361e5e1910e4f4a7b48c16e4b0e3b2c51e312e0f`; 7900 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1428 `libs/summary/adapters/model/openai-responses-reader-summary-story-normalizer.ts`
- Baseline evidence: blob `d5711cf1e827733abe9d1c5e6667558d54555106`; 15031 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1429 `libs/summary/adapters/model/openai-responses-reader-summary-weekly-model.adapter.ts`
- Baseline evidence: blob `e619f2ab36c045bd2f7d4f16b9d8a7b241f205ca`; 13912 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1430 `libs/summary/adapters/model/openai-responses-reader-summary-weekly-prompt.ts`
- Baseline evidence: blob `d93fc3709d351d56df6dc37195377696223de5e9`; 8375 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1431 `libs/summary/adapters/model/openai-responses-reader-summary-weekly-response-parser.ts`
- Baseline evidence: blob `7d0986a44ecf295e34bee3f8327ce14b651d935e`; 14082 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1432 `libs/summary/adapters/model/openai-responses-reader-summary-weekly-response-shapes.ts`
- Baseline evidence: blob `b82fe376090b4650b943d9ee31b02b94a9dbdfab`; 4537 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1433 `libs/summary/adapters/model/openai-responses-reader-summary-weekly-schema.ts`
- Baseline evidence: blob `8d3d05c997dfb09b90941d8f139e26c49e02280d`; 4963 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1434 `libs/summary/adapters/model/openai-responses-summary-citations.ts`
- Baseline evidence: blob `a6c98d37e6b670b9cb84bc4350a065d884db229c`; 4483 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1435 `libs/summary/adapters/model/openai-responses-summary-draft-normalizer.ts`
- Baseline evidence: blob `b1670f444924f6ecb4fe5f6f8fd79e3c886b9b50`; 9820 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1436 `libs/summary/adapters/model/openai-responses-summary-draft-shape.ts`
- Baseline evidence: blob `3d8c1563031ee816366922c812d6e19849f602b2`; 2659 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1437 `libs/summary/adapters/model/openai-responses-summary-json.ts`
- Baseline evidence: blob `1419d15dd4ba64e5a39c336694013ebc1d969f98`; 3162 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1438 `libs/summary/adapters/model/openai-responses-summary-model-error.ts`
- Baseline evidence: blob `ac0f2cb31e70c7f24b18eb5710b519819a1fca22`; 1667 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1439 `libs/summary/adapters/model/openai-responses-summary-model.adapter.ts`
- Baseline evidence: blob `5182213e818a8a32b308947045392138de0b2628`; 12742 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1440 `libs/summary/adapters/model/openai-responses-summary-prompt.ts`
- Baseline evidence: blob `55d0295be8fd6ebf982d144352b07d7433ac1c84`; 4937 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1441 `libs/summary/adapters/model/openai-responses-summary-response-parser.ts`
- Baseline evidence: blob `02586dd92f1992f5e95d9a0e267179177b43fbed`; 2184 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1442 `libs/summary/adapters/model/openai-responses-summary-schema.ts`
- Baseline evidence: blob `5207f55756d40302d39c67288fb6b0f6fe9c0f69`; 3052 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1443 `libs/summary/adapters/model/reader-post-canonical-presentation-instructions.ts`
- Baseline evidence: blob `34152e848fd7ed27f99315910990ece99ba38bbe`; 4581 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1444 `libs/summary/adapters/model/reader-summary-coverage-plan-test-fixture.ts`
- Baseline evidence: blob `3407f3c39a30fe3f164b4ca3a0901ba45fa01ef2`; 384 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1445 `libs/summary/adapters/model/reader-summary-daily-digest.fixture.ts`
- Baseline evidence: blob `f5a3688601d6467aff1aa695220d2d351ed43970`; 6570 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1446 `libs/summary/adapters/model/reader-summary-daily-editorial-model.ts`
- Baseline evidence: blob `e6718f3c29eda27f48ac7492df747bf294402c73`; 5143 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1447 `libs/summary/adapters/model/reader-summary-daily-input-receipt.ts`
- Baseline evidence: blob `aae6b80004d99aef1c53e0c47d54ad168ada515c`; 1920 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1448 `libs/summary/adapters/model/reader-summary-evidence-citation-map.ts`
- Baseline evidence: blob `5c2ba0620fec68ec06b0e0e3613f692b94af3c47`; 1222 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1449 `libs/summary/adapters/model/reader-summary-execution-attestation.spec-support.ts`
- Baseline evidence: blob `d9aadcdbe095034ceebb3b3fdca8fb7f4b109b60`; 2336 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1450 `libs/summary/adapters/model/reader-summary-execution-attestation.ts`
- Baseline evidence: blob `380ad573f2a97c2220f15a99412ac43d1976c907`; 6365 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1451 `libs/summary/adapters/model/reader-summary-failed-daily-editor-usage.ts`
- Baseline evidence: blob `b8adfd396911a609ac59307e6ed1dd46305f1414`; 682 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1452 `libs/summary/adapters/model/reader-summary-model-promotion.spec-support.ts`
- Baseline evidence: blob `49ecb2ac556c977f2dc7e63ce158024b22ff6cf2`; 1026 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1453 `libs/summary/adapters/model/reader-summary-narrative-repair-contract.ts`
- Baseline evidence: blob `23f71bcd0a7acbaac4612b23ba4292c1cd9e2333`; 2798 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1454 `libs/summary/adapters/model/reader-summary-reason-provenance.spec-support.ts`
- Baseline evidence: blob `efcc85660bea108610202c3d5a41bedb7d3eeb7a`; 3237 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1455 `libs/summary/adapters/model/story-relation-response-schema.ts`
- Baseline evidence: blob `6329595024d28c66b11b8887b467a9c68ddfb94b`; 3080 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1456 `libs/summary/adapters/model/summary-provider-labels.ts`
- Baseline evidence: blob `9632427928ca7b75ac89c9e458e3c5cf291f1460`; 1231 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1457 `libs/summary/adapters/monitoring/monitoring-reader-summary-accepted-topic-applier.ts`
- Baseline evidence: blob `be9a6889f4f3ba0e3b122ed2787296beac12682a`; 2703 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1458 `libs/summary/adapters/persistence/in-memory-auto-summary-candidate.repository.ts`
- Baseline evidence: blob `102b7fe4b0bde988b785d69a73ed5ba625f1f90c`; 3512 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1459 `libs/summary/adapters/persistence/in-memory-reader-summary-artifact.repository.ts`
- Baseline evidence: blob `153327ba9efee56bd4182cc6471e6782094be4ab`; 14834 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1460 `libs/summary/adapters/persistence/in-memory-reader-summary-job.repository.ts`
- Baseline evidence: blob `fcc47080ad386547bc9bbd309d1136679c221d4e`; 6584 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1461 `libs/summary/adapters/persistence/in-memory-reader-summary-operator-cancellation.ts`
- Baseline evidence: blob `04c09c4fa7d507aa7dcef6bf674e6940ba60dbf9`; 1854 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1462 `libs/summary/adapters/persistence/in-memory-reader-summary-policy.repository.ts`
- Baseline evidence: blob `0e96d1bda18465d51890b1e780316bfba2698bfe`; 2009 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1463 `libs/summary/adapters/persistence/in-memory-reader-summary-publication.ts`
- Baseline evidence: blob `598de2e06dd62378cea4775cef6b45f8da416c7a`; 8814 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1464 `libs/summary/adapters/persistence/in-memory-reader-summary-topic-recommendation-decision.repository.ts`
- Baseline evidence: blob `cf33105de45ad4310a303a81626d5e3182a38a82`; 2001 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1465 `libs/summary/adapters/persistence/in-memory-reader-summary-v3-preflight.ts`
- Baseline evidence: blob `0087c55e7c534ea133537826c2c22b427b725ecc`; 10659 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1466 `libs/summary/adapters/persistence/in-memory-summary-artifact.repository.ts`
- Baseline evidence: blob `bbd2ad2796e3877670ae42dc66445adae1b2bfc6`; 2543 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1467 `libs/summary/adapters/persistence/in-memory-summary-feedback.repository.ts`
- Baseline evidence: blob `c8e2dd029052dfe2592723c356c364f8dea377ca`; 3549 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1468 `libs/summary/adapters/persistence/in-memory-summary-job.repository.ts`
- Baseline evidence: blob `2aef4e28edd7b0dfd901cf9c3093481711d2d97d`; 2150 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1469 `libs/summary/adapters/persistence/in-memory-summary-policy.repository.ts`
- Baseline evidence: blob `1311e3438bf7d557ed428ed8dec606ebf7d3b8ef`; 853 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1470 `libs/summary/adapters/persistence/prisma/prisma-auto-summary-candidate.repository.ts`
- Baseline evidence: blob `5af90c608bad6e220ba3f582f1c285129db5affd`; 4426 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1471 `libs/summary/adapters/persistence/prisma/prisma-reader-post-catalog.ts`
- Baseline evidence: blob `4b6976270f99a55068775f41c9807bc5969ad2ef`; 12952 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1472 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-fixture.spec-support.ts`
- Baseline evidence: blob `a64a647aee7d4fae5321b89256cc92c29c2b4d17`; 4208 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1473 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-payload.ts`
- Baseline evidence: blob `b069bde69add7c129437bbff397c08b2a7929c68`; 15686 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1474 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-queries.ts`
- Baseline evidence: blob `b17503116890b159f3449ff11ad0275cca843850`; 10183 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1475 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository.spec-support.ts`
- Baseline evidence: blob `cf6f1bc8582d5ba346855879ccbe34e71eba0546`; 8050 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1476 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository.ts`
- Baseline evidence: blob `3eb1d82fcb770586b58c6ba17494b6615deb6081`; 17528 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1477 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-client.ts`
- Baseline evidence: blob `f7036fe8c7e28c48d647e123c5ed9d21a602e3eb`; 13170 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1478 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row.ts`
- Baseline evidence: blob `a8a1c9bcd8b2fcd7c23d731ddd966b5a9992090b`; 6012 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1479 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor.ts`
- Baseline evidence: blob `eb4339d6313937797226fe494347eb0c96242c1b`; 8133 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1480 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-display-schema.ts`
- Baseline evidence: blob `42dbd60293a593b39f1c0f605597e37c959223f3`; 5576 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1481 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-display-source.ts`
- Baseline evidence: blob `788714d338d6146e8635260f71a4fc57dc7b24d0`; 2875 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1482 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader.ts`
- Baseline evidence: blob `fbdb23132bc21464cc56bbb348f2f0261a0db6d9`; 10641 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1483 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository.ts`
- Baseline evidence: blob `4d6e8e7294201c2c8690292b0af0dac08da97fe0`; 13556 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1484 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-json.ts`
- Baseline evidence: blob `8ab2fb7a715ac9cb5bd91a01b52f461a36ec9942`; 5330 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1485 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-operator-cancellation.ts`
- Baseline evidence: blob `5517968a8ac8aaf50fb993dd9373133bccabb324`; 3592 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1486 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-payload-parsers.ts`
- Baseline evidence: blob `28f8b69db58fd6750e837b30a9788ec9eccca3b5`; 1555 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1487 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-payload-types.ts`
- Baseline evidence: blob `08a1b82666dba90ada47aab1f6bf7925a1e55329`; 2192 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1488 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository.ts`
- Baseline evidence: blob `54cf4ad79a45b83aa6f3169d91849467ef463184`; 3690 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1489 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority-row-locks.ts`
- Baseline evidence: blob `8881c1cf5767da0acff7b1caad3def8b7415520a`; 6123 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1490 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority-row-primitives.ts`
- Baseline evidence: blob `b23eafc3c0d4b948275b29be0e961cd36cc84125`; 3530 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1491 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority-row.ts`
- Baseline evidence: blob `abc4926c048a6c97cbfc829afbe09a4ba68f43f1`; 16900 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1492 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support.ts`
- Baseline evidence: blob `157c3346fd0f9b0a9e0833cf491ba737e84a6b4d`; 6918 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1493 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.ts`
- Baseline evidence: blob `b603471ad559bef0052fdc2207dfe83978199330`; 19534 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1494 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-attestation.ts`
- Baseline evidence: blob `3e4e09b69de72141aebc26c62caba0d7ff4fa7eb`; 6856 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1495 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-board-stamp.ts`
- Baseline evidence: blob `dc8420326d132704de8ccdc127880c619d9c9802`; 3363 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1496 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-comparator-schema.ts`
- Baseline evidence: blob `5c4a31c0b688a0916ad4c8e94669dc104c4d6db0`; 3415 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1497 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-metrics-schema.ts`
- Baseline evidence: blob `b5275f06485de988d9f013f160d2d6a25b8a8f4a`; 4057 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1498 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-schema-primitives.ts`
- Baseline evidence: blob `f5e43304e32af6f1fe321e5f91cf57d4283205d9`; 3375 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1499 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-schema.ts`
- Baseline evidence: blob `fef9c8b547cb2db809019648d422194dac2038c3`; 17482 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1500 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-promotion-v3-schema.ts`
- Baseline evidence: blob `2e50d914d258120b4a50be82868463f85cfc8d0f`; 5388 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1501 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-provider-collection-health.reader.ts`
- Baseline evidence: blob `20dfd521f24f850a176821c2451fe0723b0c63bb`; 10727 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1502 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-publication-deadline.ts`
- Baseline evidence: blob `01450b33b86ce2e75d50d45e87837eda33cce16d`; 756 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1503 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-publication.ts`
- Baseline evidence: blob `970bf72874943afc72638a92d7019c6a387047de`; 5110 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1504 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-records.ts`
- Baseline evidence: blob `c9159d69340dcaa5160dd06a63bf117a0867236d`; 11822 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1505 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization.ts`
- Baseline evidence: blob `36d1436fb79dcba20d89fcbdf240f4b6d882b610`; 19805 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1506 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-source-window.ts`
- Baseline evidence: blob `6063ee1a801f908bf4b49ab8db23b557445305e6`; 2910 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1507 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision-records.ts`
- Baseline evidence: blob `5782e54830a6680602c497d6dd6a72f74091651a`; 1976 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1508 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision.repository.ts`
- Baseline evidence: blob `b8e4a56434ebb40e04dffaaf589eb39c25fbf2b9`; 3494 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1509 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-usage.ts`
- Baseline evidence: blob `954be43cc3ebe99348e83e7d60274afda2891631`; 1203 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1510 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-preflight-lock.ts`
- Baseline evidence: blob `c6cca58cfb1e916dc63314594ccd61acd2e793ed`; 1653 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1511 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-preflight.ts`
- Baseline evidence: blob `981b969ac6d310943bb3613567e06cf3c0864a46`; 25029 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1512 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-publication-guard.ts`
- Baseline evidence: blob `fb9dc9b59b40aa0b2ee941ff93d2cb61a6482a85`; 25203 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1513 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-v3-readiness.ts`
- Baseline evidence: blob `05387be79b92ea9e857984454f7593854f76a9ad`; 4559 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1514 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-artifact.ts`
- Baseline evidence: blob `6b7a0187d8de54c8284c367092f3cdebf9ca0cd0`; 20916 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1515 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-certification-seal-authority.ts`
- Baseline evidence: blob `6b236bb4e60cd7ad3e6927806ada58f2d1d811e1`; 7475 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1516 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-projection.reader.ts`
- Baseline evidence: blob `e5c7c2f14cb75d8ff6e9d30208d2a560965e5100`; 16351 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1517 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-review-manifest.ts`
- Baseline evidence: blob `135da9175e6898d150e5c9df8c640741f7eee6ec`; 13078 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1518 `libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-story-authority.ts`
- Baseline evidence: blob `3e2982ee6ca221b533d3e3685e055266c50842a4`; 15286 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1519 `libs/summary/adapters/persistence/prisma/prisma-summary-artifact.repository.ts`
- Baseline evidence: blob `fadf04280629ba78a18de2539a8a5f0251d46154`; 3489 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1520 `libs/summary/adapters/persistence/prisma/prisma-summary-client.ts`
- Baseline evidence: blob `8eb77c768b6a8131a6edd18ea330f287269e0821`; 8346 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1521 `libs/summary/adapters/persistence/prisma/prisma-summary-connection.ts`
- Baseline evidence: blob `336f8cc034bd073135e6d02760b20704f79e0ae8`; 3613 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1522 `libs/summary/adapters/persistence/prisma/prisma-summary-event.publisher.ts`
- Baseline evidence: blob `1aa27a94882e62a8c05c4af729d54e8b6875cdab`; 943 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1523 `libs/summary/adapters/persistence/prisma/prisma-summary-feedback.repository.ts`
- Baseline evidence: blob `3c16203788a49fdcce3791fca981ec7851eddb85`; 4168 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1524 `libs/summary/adapters/persistence/prisma/prisma-summary-job.repository.ts`
- Baseline evidence: blob `0384cc7824eb760b6bf49b89632dd733bb58f0b1`; 4010 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1525 `libs/summary/adapters/persistence/prisma/prisma-summary-policy.repository.ts`
- Baseline evidence: blob `ce5bb9ddf4ff35325ee43c1b6d6fb4d57e6ffb74`; 1963 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1526 `libs/summary/adapters/persistence/prisma/prisma-summary-records.ts`
- Baseline evidence: blob `7e116ab3ea0c6c864eef6916a5fed7a80ab58865`; 15272 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1527 `libs/summary/adapters/persistence/prisma/prisma-summary-transaction.ts`
- Baseline evidence: blob `b94ad324b113ddf5205e5b3427636e45c3617b56`; 2113 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1528 `libs/summary/adapters/persistence/prisma/reader-headline-artifact.spec-support.ts`
- Baseline evidence: blob `14acab7bd70f9cca136bfd458b123dac18164aaa`; 2415 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1529 `libs/summary/adapters/persistence/prisma/reader-summary-daily-generation-publication-guard.ts`
- Baseline evidence: blob `44b109fb51daf0a45290970e07cdd90cbc96fd18`; 3487 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1530 `libs/summary/adapters/persistence/prisma/reader-summary-publication-json-comparison.ts`
- Baseline evidence: blob `6b6ff39d14f7e1d14821c4820dd5f0bd5f807d70`; 453 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1531 `libs/summary/adapters/persistence/prisma/reader-summary-weekly-story-authority-hashes.ts`
- Baseline evidence: blob `4ed2c68aa1fc2eef147888c35607736d9e9edc9d`; 3264 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1532 `libs/summary/adapters/persistence/reader-summary-promotion-engagement-guard.ts`
- Baseline evidence: blob `127ee4924162c06382bf961130dc1f4533499dbb`; 5784 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1533 `libs/summary/adapters/persistence/reader-summary-publication-proof.ts`
- Baseline evidence: blob `a6a7ab68ef0c6155f07769fa07d25da39ffec3cd`; 12773 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1534 `libs/summary/adapters/persistence/reader-summary-recovery-receipt.ts`
- Baseline evidence: blob `91cf050f5f07bc67162cbd2eb3d00b2cc8ec23a0`; 6554 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1535 `libs/summary/adapters/persistence/reader-summary-weekly-publication-evidence.ts`
- Baseline evidence: blob `32004264db1ee8b59076a4f7da4e2095d0f23057`; 1747 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1536 `libs/summary/adapters/persistence/reader-summary-weekly-publication-payload.ts`
- Baseline evidence: blob `f3f259d02070c354329609ac65da889a47dac67e`; 4351 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1537 `libs/summary/adapters/persistence/unavailable-reader-summary-weekly-projection.reader.ts`
- Baseline evidence: blob `b3e864b87b978c3045b4bb1a0771fd04686a0127`; 663 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1538 `libs/summary/adapters/preferences/noop-user-summary-preference.reader.ts`
- Baseline evidence: blob `0e507a1890b66d2240899a254b72454cb87d29c1`; 414 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1539 `libs/summary/adapters/quota/usage-summary-quota.adapter.ts`
- Baseline evidence: blob `c2a35209a4bab8a8679d43b82664dba1dd15777b`; 1253 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1540 `libs/summary/adapters/video/deterministic-youtube-video-summary.provider.ts`
- Baseline evidence: blob `b172fc64f8caf76b291b00bef65ee3a5825701b3`; 1555 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1541 `libs/summary/adapters/video/disabled-youtube-video-summary.provider.ts`
- Baseline evidence: blob `df26cf5774b1121c60aabef84c9a5e1cd7091a3f`; 462 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1542 `libs/summary/adapters/video/google-gemini-youtube-video-summary.provider.ts`
- Baseline evidence: blob `90e37970c091dd0d96a62de89ab804f73a490daf`; 10105 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1543 `libs/summary/adapters/video/youtube-url.ts`
- Baseline evidence: blob `5533d8a8543b9f5c3db230b932e73b79e513c1cf`; 1214 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1544 `libs/summary/application/contracts/reader-post-assessment-identity.ts`
- Baseline evidence: blob `83870073d6439bb7d7a95f656a69d9377036ce69`; 1418 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1545 `libs/summary/application/contracts/reader-post-catalog.ts`
- Baseline evidence: blob `44870a2e6ccdf81a9adb90286ddac8799f14053a`; 1286 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1546 `libs/summary/application/contracts/reader-summary-candidate-qualification.ts`
- Baseline evidence: blob `f375b4c8e10ec66ec0714e278fcef3ff729149b9`; 984 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1547 `libs/summary/application/contracts/reader-summary-first-publication-authority.ts`
- Baseline evidence: blob `09bc0a58a728fd58ec43934bfcdae68327b3a1c6`; 540 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1548 `libs/summary/application/contracts/reader-summary-native-owner.ts`
- Baseline evidence: blob `9e7840a8b21341929551dc364b1ad5e57e18a50a`; 1665 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1549 `libs/summary/application/contracts/reader-summary-new-input-refresh-authority.ts`
- Baseline evidence: blob `30b6ca8f16c4bf2df0d4a6e85c8312d44b74b8ee`; 332 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1550 `libs/summary/application/contracts/reader-summary-usage-scope.ts`
- Baseline evidence: blob `4f434e25a95f9176940c21441132f22134b286be`; 354 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application orchestration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 1551 `libs/summary/domain/aggregates/reader-summary-open-questions.ts`
- Baseline evidence: blob `236768c76a40752bc26805025db75c27c4053497`; 1590 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1552 `libs/summary/domain/aggregates/reader-summary.ts`
- Baseline evidence: blob `1be16dc54fa0caf481eeffa17eb1335efd2ab051`; 18529 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1553 `libs/summary/domain/effective-summary-policy.ts`
- Baseline evidence: blob `bdd28e170459192bd77c7ec69f37bbfd0bca8882`; 2135 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1554 `libs/summary/domain/entities/citation.ts`
- Baseline evidence: blob `6f8ed1748978caae97d011b30757fbaa9bef084b`; 262 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1555 `libs/summary/domain/entities/reader-action.ts`
- Baseline evidence: blob `c22b4311a7c528beba0a92a67125959d710f8d22`; 438 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1556 `libs/summary/domain/entities/reader-summary-artifact-validation-values.ts`
- Baseline evidence: blob `42fa8f515de9a50fd913f7458357600fcb3df6e7`; 567 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1557 `libs/summary/domain/entities/reader-summary-artifact-validation.ts`
- Baseline evidence: blob `a898b023bd9f9bd5006126df8d14a30f3377dc69`; 16644 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1558 `libs/summary/domain/entities/reader-summary-artifact.ts`
- Baseline evidence: blob `8515eab0f4f0c4fa8c9afd5e6833d4579291bfd2`; 18586 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1559 `libs/summary/domain/entities/reader-summary-citation-evidence-validation.ts`
- Baseline evidence: blob `48c9a2218eed668e367d7ed7f22f54767532d790`; 783 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1560 `libs/summary/domain/entities/reader-summary-claim-validation.ts`
- Baseline evidence: blob `3a559ae050f3f081e064de41be81b3e0a1d11bcd`; 2122 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1561 `libs/summary/domain/entities/reader-summary-claim.ts`
- Baseline evidence: blob `3975cf700223f4b5c836ed3a9099b2aa2802e566`; 851 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1562 `libs/summary/domain/entities/reader-summary-content-identity.ts`
- Baseline evidence: blob `8b8d7a42505c85172d67a690c52eb706ba245665`; 4749 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1563 `libs/summary/domain/entities/reader-summary-content-shape.ts`
- Baseline evidence: blob `927b48969da453dfa842d86f70a7b7629faf6e39`; 1716 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1564 `libs/summary/domain/entities/reader-summary-content-supplemental-validation.ts`
- Baseline evidence: blob `cf361a7ba1782104aa07c86c1c8f7dfdab11ac6b`; 4724 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1565 `libs/summary/domain/entities/reader-summary-content-validation.ts`
- Baseline evidence: blob `0e2082960a12e95cbf783463e6d02a77383cf75c`; 14822 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1566 `libs/summary/domain/entities/reader-summary-display-immutability.ts`
- Baseline evidence: blob `3dd13c02cbbacdd98da363d033f0e68b5b1dea57`; 1257 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1567 `libs/summary/domain/entities/reader-summary-job.ts`
- Baseline evidence: blob `f32ef56cf7d0455876850c47860c192db1dab9ac`; 17489 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1568 `libs/summary/domain/entities/reader-summary-narrative-section.ts`
- Baseline evidence: blob `39e67b0f3fe317a20b0e380732e869141eee591f`; 503 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1569 `libs/summary/domain/entities/reader-summary-narrative-validation.ts`
- Baseline evidence: blob `de950be0a2ec7371c7d4d6004cc77ac826b2ee10`; 1283 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1570 `libs/summary/domain/entities/reader-summary-policy.ts`
- Baseline evidence: blob `12acdcc7b77a15e1d4433e65ff1a66b2d3237941`; 7470 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1571 `libs/summary/domain/entities/reader-summary-promotion-attestation-validation.ts`
- Baseline evidence: blob `27f3ba734e3c819de0383cd55844ada41b314787`; 13696 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1572 `libs/summary/domain/entities/reader-summary-promotion-editorial-slate-validation.ts`
- Baseline evidence: blob `fa84e2ec1839d41f3f8a032961301562ca9ecb25`; 9297 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1573 `libs/summary/domain/entities/reader-summary-promotion-order-validation.ts`
- Baseline evidence: blob `82ab2d3c54745c64fde3d4f2a4ef13d9baa6a5b0`; 12579 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1574 `libs/summary/domain/entities/reader-summary-promotion-v1-validation.ts`
- Baseline evidence: blob `4665dabd471ed91d74a9b8c71a29df0c63199252`; 11838 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1575 `libs/summary/domain/entities/reader-summary-reliability.ts`
- Baseline evidence: blob `6d5ea707b78f6ab26284651a7155246147399a38`; 1294 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1576 `libs/summary/domain/entities/reader-summary-snapshot.ts`
- Baseline evidence: blob `a7ea1707234bea4dbc25528a224cf0ed59554e26`; 1580 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1577 `libs/summary/domain/entities/reader-summary-topic-map.ts`
- Baseline evidence: blob `d917b973091208adf5ea4681f1f0e7624f78c9da`; 2093 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1578 `libs/summary/domain/entities/reader-summary-topic-recommendation-decision.ts`
- Baseline evidence: blob `c66df86ca648f33993b913a0549fa1e4467f58ef`; 2945 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1579 `libs/summary/domain/entities/reader-summary-topic-recommendation.ts`
- Baseline evidence: blob `ce3220799d75890b6cb8e8131b1719723819e832`; 1762 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1580 `libs/summary/domain/entities/reader-summary-weekly-artifact.ts`
- Baseline evidence: blob `67bfcea2a43285ee23573987c10b81987b0208b6`; 12168 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1581 `libs/summary/domain/entities/reader-summary-weekly-story-observation.ts`
- Baseline evidence: blob `f6be453dc2cae8be8c3faf7f17e0054de2c80540`; 12642 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1582 `libs/summary/domain/entities/source-mix-entry.ts`
- Baseline evidence: blob `ff85a2eafc2cca12c8f52a33d3e4586a27a7fec4`; 293 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1583 `libs/summary/domain/entities/summary-artifact.ts`
- Baseline evidence: blob `74f6208f5deb5f367f88a1fbd3a67bedf99e990d`; 5876 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1584 `libs/summary/domain/entities/summary-feedback.ts`
- Baseline evidence: blob `cebafe0726f89e7d895cee67bc48f4db7251ac13`; 3786 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1585 `libs/summary/domain/entities/summary-job.ts`
- Baseline evidence: blob `df6aa82467db0a7c52aaa21cb1e92ded22dcb871`; 4969 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1586 `libs/summary/domain/entities/summary-policy.ts`
- Baseline evidence: blob `ae607476cc16e3756f5f1400d57308e7cd4504b2`; 5070 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1587 `libs/summary/domain/entities/top-read.ts`
- Baseline evidence: blob `ef1b46a327609b9a22aa76604f001c50f7e69df1`; 4966 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1588 `libs/summary/domain/events/reader-action-recorded.event.ts`
- Baseline evidence: blob `024e157b01eef77e0353afa358e31509da5ae102`; 450 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1589 `libs/summary/domain/events/reader-summary-generated.event.ts`
- Baseline evidence: blob `26c03ff33f3f771dd6ea9f3849131aba49afafdb`; 380 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1590 `libs/summary/domain/events/reader-summary-ready.event.ts`
- Baseline evidence: blob `78c3344887444541b3c4e76970fb15ec18b13f43`; 931 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1591 `libs/summary/domain/events/summary-ready.event.ts`
- Baseline evidence: blob `7f4c705a1062e72b12f74d66e8a8879f1ea30325`; 565 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1592 `libs/summary/domain/index.ts`
- Baseline evidence: blob `dfac8383626a9b6f62edeaf165b6930d163963ef`; 8219 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1593 `libs/summary/domain/policies/additional-notable-story-eligibility-policy.ts`
- Baseline evidence: blob `86842c84d708347ae8de8da8733996125c0e8b17`; 1677 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1594 `libs/summary/domain/policies/reader-action-policy.ts`
- Baseline evidence: blob `c218f8e72737d9f55a3fd400828c8c87159a9d7e`; 3240 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1595 `libs/summary/domain/policies/reader-display-title-policy.ts`
- Baseline evidence: blob `832bbb42fddd552274f7931d023e1942c7588960`; 1808 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1596 `libs/summary/domain/policies/reader-display-title-quality.ts`
- Baseline evidence: blob `438767cfcbca2d9af8c970f3c3fb9ccfc0729f2c`; 1431 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1597 `libs/summary/domain/policies/reader-interest-section-policy.ts`
- Baseline evidence: blob `3df374ead78a53ee2db8d5effcb0790f5873e60e`; 1366 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1598 `libs/summary/domain/policies/reader-post-browse-order.ts`
- Baseline evidence: blob `33ee7b7f7c0f00456ed9e9816ca12815e1f2557d`; 3574 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1599 `libs/summary/domain/policies/reader-post-promotion-confidence-policy.ts`
- Baseline evidence: blob `9f57161526642aca920c047175aeef9339d05bff`; 3348 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1600 `libs/summary/domain/policies/reader-post-promotion-engagement.ts`
- Baseline evidence: blob `fe4c2c2eaa838f74f23f30d0d04ec8d06c2fdd90`; 7256 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1601 `libs/summary/domain/policies/reader-post-promotion-policy-contract.ts`
- Baseline evidence: blob `891fde10a1c8716c11e462d9c49190fa4be2aac5`; 14232 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1602 `libs/summary/domain/policies/reader-post-promotion-policy.spec-support.ts`
- Baseline evidence: blob `094f5b0d144ceb5d61c89d7b3461c2bfbd1dfe8a`; 2547 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1603 `libs/summary/domain/policies/reader-post-promotion-policy.ts`
- Baseline evidence: blob `f13ac8625fc810b3da7a42841128199d405ea581`; 15321 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1604 `libs/summary/domain/policies/reader-post-promotion-selection.ts`
- Baseline evidence: blob `00e708b19958c16d64b6bb9263df509b339adedd`; 17601 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1605 `libs/summary/domain/policies/reader-post-promotion-support-authority.ts`
- Baseline evidence: blob `d6989cdc70262f29a66c9a16a6c0ee7c33ad884b`; 628 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1606 `libs/summary/domain/policies/reader-post-promotion-v1-holdout.ts`
- Baseline evidence: blob `99902142c17605ee73b56c1064440cdeea113eb4`; 1506 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1607 `libs/summary/domain/policies/reader-post-promotion-v3.ts`
- Baseline evidence: blob `7eb29da95d522e562c731727e6aa44b45742f529`; 4464 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1608 `libs/summary/domain/policies/reader-promotion-news-publisher.ts`
- Baseline evidence: blob `22c47305f6c5d9110c52109c4a7df677edcd7cfa`; 2618 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1609 `libs/summary/domain/policies/reader-promotion-policy-version.ts`
- Baseline evidence: blob `61118728dce987108420c3584e434448721cb17b`; 1033 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1610 `libs/summary/domain/policies/reader-promotion-ranking.ts`
- Baseline evidence: blob `577faeb24de0391041583bc949f8da6efd23494a`; 20231 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1611 `libs/summary/domain/policies/reader-promotion-score.ts`
- Baseline evidence: blob `355c3b41b3896651bf19eeeb45abb41a089bdd34`; 4269 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1612 `libs/summary/domain/policies/reader-promotion-source-registry.ts`
- Baseline evidence: blob `42cc57ee6516091252df5d7ebf7d4b5a73d18dc1`; 2777 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1613 `libs/summary/domain/policies/reader-summary-agent-topic-evidence-policy.ts`
- Baseline evidence: blob `f01818de5ec9c0f27b975aab9eb7bf2ee2c82cb7`; 9078 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1614 `libs/summary/domain/policies/reader-summary-artifact-editorial-quality-policy.ts`
- Baseline evidence: blob `c4450a39e29540523cbfcfb95fe2b8ab736f4134`; 11194 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1615 `libs/summary/domain/policies/reader-summary-display-publication.ts`
- Baseline evidence: blob `6d1a977e2c719b07b4b08d1625be691621591870`; 3491 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1616 `libs/summary/domain/policies/reader-summary-editorial-curation-policy.ts`
- Baseline evidence: blob `d282ea4877402fb971e5f79708cdcffe18a0b654`; 2039 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1617 `libs/summary/domain/policies/reader-summary-editorial-priority-policy.ts`
- Baseline evidence: blob `d465638f3d5702b333c1bed1fe98fe0d80382c8b`; 6321 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1618 `libs/summary/domain/policies/reader-summary-evidence-eligibility-policy.ts`
- Baseline evidence: blob `61a34f7ccce04415780f23abbe91bfd3a2564304`; 911 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1619 `libs/summary/domain/policies/reader-summary-github-archived-projection.ts`
- Baseline evidence: blob `55fbad3896c0db4fdd7bd7399794d3a103a89547`; 10476 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1620 `libs/summary/domain/policies/reader-summary-github-historical-omission-policy.ts`
- Baseline evidence: blob `578d65cef8eb154c1c0d3b1e9925e8f75ec6d414`; 2651 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1621 `libs/summary/domain/policies/reader-summary-github-projection-audit-types.ts`
- Baseline evidence: blob `13b57e592c8ae1bc80735e9f731a5c9430cd1192`; 3370 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: Stage B candidate: explicit legacy domain edge; retain until contract migration is tested. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1622 `libs/summary/domain/policies/reader-summary-github-projection-audit.ts`
- Baseline evidence: blob `af1eaba7b5ba1ae659327f6d18beb7b80955939e`; 16812 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1623 `libs/summary/domain/policies/reader-summary-github-projection-candidates.ts`
- Baseline evidence: blob `08e2571c3e727b303811fa7812aa91a6cdc30fc2`; 4278 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1624 `libs/summary/domain/policies/reader-summary-github-projection-collection-window.ts`
- Baseline evidence: blob `25fad8b141f6d558fe179f7116483b0626bb5d8f`; 3367 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1625 `libs/summary/domain/policies/reader-summary-github-projection-evaluation.ts`
- Baseline evidence: blob `12359a8e736ddca252a7b9ba6f203b9d9cb1952f`; 2177 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1626 `libs/summary/domain/policies/reader-summary-github-projection-no-signal.ts`
- Baseline evidence: blob `d99de4ff05c9405fc07960ad0546f43e5b53940f`; 1098 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1627 `libs/summary/domain/policies/reader-summary-github-projection-policy.spec-support.ts`
- Baseline evidence: blob `7063cc27b38808debf9532edc1b9f7edeefddecb`; 13790 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1628 `libs/summary/domain/policies/reader-summary-github-projection-policy.ts`
- Baseline evidence: blob `c2274d73df60da8b1e0a48012966d0fb94cf9900`; 15584 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1629 `libs/summary/domain/policies/reader-summary-github-projection-set.ts`
- Baseline evidence: blob `9ac011278d9f2dfa8e7e8f147a936794369b104f`; 17248 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1630 `libs/summary/domain/policies/reader-summary-github-projection-verification.ts`
- Baseline evidence: blob `004334ae447deb25c7bbf75ae092a251866f2c38`; 2035 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1631 `libs/summary/domain/policies/reader-summary-github-trending-policy.ts`
- Baseline evidence: blob `628c0a9a23ff85d711c1fa99532a9476434532d3`; 14650 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1632 `libs/summary/domain/policies/reader-summary-lead-eligibility-policy.ts`
- Baseline evidence: blob `a9d0406100f98512e331d22487ea6295c7d58989`; 1030 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1633 `libs/summary/domain/policies/reader-summary-model-authority-policy.ts`
- Baseline evidence: blob `99cc7ef5539f3d1fa6be83d543ccf2f4be959252`; 1058 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1634 `libs/summary/domain/policies/reader-summary-multi-day-generation-profile.ts`
- Baseline evidence: blob `77a30fb9a044c8097a816bf27362bd7990f53fee`; 818 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1635 `libs/summary/domain/policies/reader-summary-multi-day-quality-eval.ts`
- Baseline evidence: blob `3c18dd34b80b5f8db7aacf2c92180697bd9f7049`; 13280 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1636 `libs/summary/domain/policies/reader-summary-multi-day-quality-input-validation.ts`
- Baseline evidence: blob `46557d9518c780f0f3622fb073ae60fc4d55e8be`; 7030 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1637 `libs/summary/domain/policies/reader-summary-multi-day-quality-metrics.ts`
- Baseline evidence: blob `53ec36a68a5df92b6b07b5b4b09276dc26da28a6`; 10967 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1638 `libs/summary/domain/policies/reader-summary-narrative-headline-policy.ts`
- Baseline evidence: blob `f763f32c683a61a928c56d528de8a8b6b2575d8a`; 1938 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1639 `libs/summary/domain/policies/reader-summary-promotion-publication-oracle.ts`
- Baseline evidence: blob `ad1899322e4e9eea64b1de765ff52ffd8b3cb213`; 20035 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1640 `libs/summary/domain/policies/reader-summary-promotion-publication-test-fixtures.ts`
- Baseline evidence: blob `f20c9caad3296f321768981892725e2dd80e4b68`; 5796 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1641 `libs/summary/domain/policies/reader-summary-promotion-publication-verification.ts`
- Baseline evidence: blob `6cc11c2f897cf17dc744b9c3e0bd2b0423a5a89f`; 5440 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1642 `libs/summary/domain/policies/reader-summary-publication-decision.ts`
- Baseline evidence: blob `4bcc327c4d6a9dc6978c56245564153f1818a7a3`; 3212 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1643 `libs/summary/domain/policies/reader-summary-publication-evidence-test-fixtures.ts`
- Baseline evidence: blob `51c8b69203d4661e4023ff4fb7bf4bdadae6edcf`; 11676 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1644 `libs/summary/domain/policies/reader-summary-publication-generation-policy.ts`
- Baseline evidence: blob `4cf2ff979fc0b01a023e6ecbecf720617cd4f4a5`; 830 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1645 `libs/summary/domain/policies/reader-summary-publication-policy-test-fixtures.ts`
- Baseline evidence: blob `62be537bfcb6fcd7399b624f574c084c47f2c1e5`; 11488 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1646 `libs/summary/domain/policies/reader-summary-publication-policy.spec-support.ts`
- Baseline evidence: blob `4f5a4b0cbfa4ffe95bc2e27c621fe486ffb1edb7`; 1772 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1647 `libs/summary/domain/policies/reader-summary-publication-policy.ts`
- Baseline evidence: blob `0b16efa97264fb3248a500f1e1f5e033fe41d551`; 19112 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1648 `libs/summary/domain/policies/reader-summary-publication-shadow.ts`
- Baseline evidence: blob `5a597e0820576de55878bc8bdf409a796fe7dfcf`; 3014 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1649 `libs/summary/domain/policies/reader-summary-publication-technical-leaks.ts`
- Baseline evidence: blob `600611e7e0e49fd2d81b8960a567333039a53a1e`; 2953 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1650 `libs/summary/domain/policies/reader-summary-reader-facing-text-policy.ts`
- Baseline evidence: blob `9e27fd2cecf0d82ac6b94385e1fc4fee4001b82d`; 10476 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1651 `libs/summary/domain/policies/reader-summary-reliability-calibration-policy.ts`
- Baseline evidence: blob `b919629237d38017c34fb722f4103c8288ac3d16`; 9279 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1652 `libs/summary/domain/policies/reader-summary-schedule-window-policy.ts`
- Baseline evidence: blob `0ac3e8b8a1cbf1b17ba9947becf695e8ed5a90f5`; 1747 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1653 `libs/summary/domain/policies/reader-summary-source-authority-policy.ts`
- Baseline evidence: blob `a361ee63e12b345bd4ef08f1f08797e886f6f455`; 3847 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1654 `libs/summary/domain/policies/reader-summary-story-identity-policy.ts`
- Baseline evidence: blob `530fcf440e837d85f4da838e1a5d117ae4668c24`; 13175 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1655 `libs/summary/domain/policies/reader-summary-top-read-description-policy.ts`
- Baseline evidence: blob `3318750e314f1f6e55fc2c6af355c20d809a55a4`; 4050 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1656 `libs/summary/domain/policies/reader-summary-topic-map-edge-policy.ts`
- Baseline evidence: blob `60358c4a31259b8a5355a62ed1798b29ecbd42a0`; 6528 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1657 `libs/summary/domain/policies/reader-summary-topic-map-grouping-policy.ts`
- Baseline evidence: blob `4346982ec65aca5da934140bb9de050b0ca8d6f4`; 9694 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1658 `libs/summary/domain/policies/reader-summary-topic-map-semantic-eval.ts`
- Baseline evidence: blob `13fb7cab162ab4b5ca07f34cbd278903a7bcc628`; 11315 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1659 `libs/summary/domain/policies/reader-summary-topic-map-structure-quality.ts`
- Baseline evidence: blob `2f5c192a0e3733b3fe5f096255dcdbdae706b7bb`; 6859 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1660 `libs/summary/domain/policies/reader-summary-topic-recommendation-label.ts`
- Baseline evidence: blob `5464ecc7f4867139610ac046f43edb216e2e9164`; 3803 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1661 `libs/summary/domain/policies/reader-summary-topic-recommendation-policy.ts`
- Baseline evidence: blob `7921323c2673fa8043003656a150936830a67e3b`; 13582 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1662 `libs/summary/domain/policies/reader-summary-transient-recovery.ts`
- Baseline evidence: blob `05bf8aa233130c963e6831fbaceddb4f3efd1728`; 1373 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1663 `libs/summary/domain/policies/reader-summary-v3-publication.ts`
- Baseline evidence: blob `8b808f8c706fda04fcb05a6f13d8ae52fc3f1129`; 1579 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1664 `libs/summary/domain/policies/reader-summary-watch-eligibility-policy.ts`
- Baseline evidence: blob `fc94a61a36eac4277d62939258571843ec845c8b`; 1767 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1665 `libs/summary/domain/policies/reader-summary-weekly-editorial-citation-metrics.ts`
- Baseline evidence: blob `f2f4e410142fe9f6f5dbf6a0731511a9250748b2`; 1085 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1666 `libs/summary/domain/policies/reader-summary-weekly-editorial-quality-policy.ts`
- Baseline evidence: blob `ca12b332981ed33d4d957976613f6dcf4c2306bd`; 19073 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1667 `libs/summary/domain/policies/reader-summary-weekly-publication-authority-proof.ts`
- Baseline evidence: blob `1beaa9e8ca3af29812346f56a8e0995d375c93f0`; 1480 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1668 `libs/summary/domain/policies/reader-summary-weekly-publication-authorization-support.ts`
- Baseline evidence: blob `40efca2c188c3d15719a23a02da2213ca4adc0b4`; 20320 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1669 `libs/summary/domain/policies/reader-summary-weekly-publication-authorization.ts`
- Baseline evidence: blob `6b965c57a85c1119ea30fd64efc88f3494191571`; 13548 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1670 `libs/summary/domain/policies/reader-summary-weekly-schedule-policy.ts`
- Baseline evidence: blob `e3382568fe39ca9384d7a65d2be23a7d39cde9be`; 12704 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1671 `libs/summary/domain/policies/rendered-top-read-selection-policy.ts`
- Baseline evidence: blob `8072b08e902784d781d858179df89dd1443730bc`; 5138 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1672 `libs/summary/domain/policies/representative-evidence-selection-policy.ts`
- Baseline evidence: blob `e5cf647b4fc410dc18f7324b1e8131f26ba3f826`; 5217 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1673 `libs/summary/domain/policies/source-mix-quality-policy.ts`
- Baseline evidence: blob `5ef65d052f5edc578ee9b5f3579eee10dc512953`; 7128 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1674 `libs/summary/domain/policies/story-ranking-policy.ts`
- Baseline evidence: blob `761c5def502acce6e80cf62ea36efacec8508be2`; 2605 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1675 `libs/summary/domain/policies/story-relation-eval-policy.ts`
- Baseline evidence: blob `615b7c349ab46bcc8874d2cef62b58356817200e`; 4181 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1676 `libs/summary/domain/policies/story-relation-safe-recall-rollout-policy.ts`
- Baseline evidence: blob `e93a68814fb761fe0cc9d06ec586c6e215bced6e`; 5063 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1677 `libs/summary/domain/policies/summary-evidence-pack-policy.ts`
- Baseline evidence: blob `c7a14f925a56a1b48503c44d3efcd0c450ff4797`; 9229 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1678 `libs/summary/domain/policies/summary-evidence-profile-policy.ts`
- Baseline evidence: blob `e2368b6234900213231ace14c115c08deccd275b`; 4752 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1679 `libs/summary/domain/policies/summary-feedback-eval-backlog-policy.ts`
- Baseline evidence: blob `46072e87c9150627ccae707088f3f841b93e46b8`; 15041 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1680 `libs/summary/domain/policies/top-read-candidate-identity-policy.ts`
- Baseline evidence: blob `adada7efc4fead8af199068ed0b08045c9113ca2`; 9729 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1681 `libs/summary/domain/policies/top-read-core-topic-policy.ts`
- Baseline evidence: blob `b45bd6f3da5593d7242658375d03d94e0ac1afee`; 2330 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1682 `libs/summary/domain/policies/top-read-eligibility-policy.ts`
- Baseline evidence: blob `42bc2198855607d8e872890bd332dba5eb12ffab`; 4217 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1683 `libs/summary/domain/policies/top-read-provider-balance-policy.ts`
- Baseline evidence: blob `865f37e38a4c89840c883185a7b05065c9d1efb4`; 5263 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1684 `libs/summary/domain/policies/top-read-provider-diversity-policy.ts`
- Baseline evidence: blob `7accd67e0de3b79fa7cd657ae0d7485cbedb146b`; 1021 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1685 `libs/summary/domain/services/mimo-qualified-headline-codec.ts`
- Baseline evidence: blob `df0bb66bf76636e458fe2a40002aaac5f8c92b12`; 3851 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1686 `libs/summary/domain/services/reader-post-display-headline.ts`
- Baseline evidence: blob `e10319f073df6cc3dd288d586ebff17e45a7ee91`; 11609 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1687 `libs/summary/domain/services/reader-post-display-identity.ts`
- Baseline evidence: blob `5c709d2a7bfaf8512fd090bbf273af4dadca430a`; 4550 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1688 `libs/summary/domain/services/reader-post-presentation-batch-decode.ts`
- Baseline evidence: blob `9647ed7e2fd004eabb807eea32750636e6283a87`; 2577 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1689 `libs/summary/domain/services/reader-post-presentation-failure.ts`
- Baseline evidence: blob `cc0e4a8ed56a5d964d44405090389bfc5614c7bd`; 1372 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1690 `libs/summary/domain/services/reader-post-presentation-reference-catalog.ts`
- Baseline evidence: blob `7af60d5434ef845044bfe187acfb75a5f9600c37`; 5680 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1691 `libs/summary/domain/services/reader-post-presentation-v3-proposal.ts`
- Baseline evidence: blob `16fd5a9f778c5a082f1d2797a4fcd03c3afe2a09`; 7502 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1692 `libs/summary/domain/services/reader-post-presentation-v3.ts`
- Baseline evidence: blob `a50f53faea923ca1da4447f212384c6c9a0f93e4`; 13477 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1693 `libs/summary/domain/services/reader-post-promotion-admitted-clusters.ts`
- Baseline evidence: blob `153401ca757bc7cc22760fd9819b355149111f66`; 2544 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1694 `libs/summary/domain/services/reader-post-promotion-attestation-v3.ts`
- Baseline evidence: blob `5ff2d52f1a0801bfe21b91195bd54997b766beb8`; 4669 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1695 `libs/summary/domain/services/reader-post-promotion-attestation.spec-support.ts`
- Baseline evidence: blob `84e1f3a830a45ebee3d444d007559857e65d73b6`; 5964 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1696 `libs/summary/domain/services/reader-post-promotion-attestation.ts`
- Baseline evidence: blob `050d1523eb1c8c298973c9b64c726b0b139180f4`; 8579 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1697 `libs/summary/domain/services/reader-post-promotion-editorial-slate-selection.ts`
- Baseline evidence: blob `3e5f24e56333012038fb0f8ff9a91b2414acb9ba`; 4650 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1698 `libs/summary/domain/services/reader-post-promotion-evidence-admission.ts`
- Baseline evidence: blob `733a45eefd5cc45e281f288dfc21a47d28a882e4`; 15515 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1699 `libs/summary/domain/services/reader-post-promotion-evidence-input.ts`
- Baseline evidence: blob `7f46f9a6739c5ab212b367f3a9d6b0f6d494d36b`; 3137 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1700 `libs/summary/domain/services/reader-post-promotion-freshness.ts`
- Baseline evidence: blob `5b278504dc2bb049dfec2d51ff03a9982fab1d4d`; 1710 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1701 `libs/summary/domain/services/reader-post-promotion-independent-support.ts`
- Baseline evidence: blob `03f484b676ff2f930c229436101a6c354a369122`; 2093 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1702 `libs/summary/domain/services/reader-post-promotion-projection.ts`
- Baseline evidence: blob `f9a937ef8584065b84dde4e38636b61df679d0d9`; 19121 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1703 `libs/summary/domain/services/reader-post-promotion-reasons.ts`
- Baseline evidence: blob `87d27fc0170b0052773f4dc03515944a91262209`; 4009 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1704 `libs/summary/domain/services/reader-post-promotion-title.ts`
- Baseline evidence: blob `c933cf5f6cf0ba2b1396a1a229c17129e3ea4543`; 4424 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1705 `libs/summary/domain/services/reader-post-promotion-v3-projection.ts`
- Baseline evidence: blob `bdee8e7b90eb4b23ff8032475a8e4eea4c37d92d`; 10155 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1706 `libs/summary/domain/services/reader-promotion-story-title-duplicate.ts`
- Baseline evidence: blob `7d0531be3147431143edf45ddf7c9954e8f514d2`; 980 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1707 `libs/summary/domain/services/reader-summary-claim-board.ts`
- Baseline evidence: blob `4f462a2713fab9eadf78a50d401c75c193bcd36a`; 7721 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1708 `libs/summary/domain/services/reader-summary-coverage-plan.ts`
- Baseline evidence: blob `b7eb735118061261e2fa6d6a906dcf7c95f3e5c6`; 13820 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1709 `libs/summary/domain/services/reader-summary-daily-editorial-plan.ts`
- Baseline evidence: blob `72087fae7acbf822ce26a1c8cccccaa751253b8d`; 6147 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1710 `libs/summary/domain/services/reader-summary-daily-generation-selection.ts`
- Baseline evidence: blob `2e94fb3a404f253bd4428a3f861c8c68b4810556`; 3193 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1711 `libs/summary/domain/services/reader-summary-daily-input-binding.ts`
- Baseline evidence: blob `647f005f22999dddb4d3069701ecc54030c88f87`; 9078 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1712 `libs/summary/domain/services/reader-summary-fallback-source-window.ts`
- Baseline evidence: blob `aaa4a08569987f7b6a0d4077cfc45f80516863d2`; 801 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1713 `libs/summary/domain/services/reader-summary-headline-policy.ts`
- Baseline evidence: blob `5e6fb968bfb0d445bc1743b608d0c93157d6cba4`; 8285 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1714 `libs/summary/domain/services/reader-summary-main-topics.ts`
- Baseline evidence: blob `290f1da88f7957ffe5eb44cad3192735626a7def`; 7472 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1715 `libs/summary/domain/services/reader-summary-related-topics.ts`
- Baseline evidence: blob `8fa1865acd7d218750692806eb5a0bce878452eb`; 14386 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1716 `libs/summary/domain/services/reader-summary-source-lineage.ts`
- Baseline evidence: blob `d61af25ac43fe5a689d9212bcb643779e67c9d2b`; 3960 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1717 `libs/summary/domain/services/reader-summary-supplemental-selected-posts.ts`
- Baseline evidence: blob `d542e91ac0a75af8c977ce94afbbe9b99f3d0c93`; 3257 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1718 `libs/summary/domain/services/reader-summary-support.ts`
- Baseline evidence: blob `f6605ed0d6b31383af842a95619e8eacb8129ab5`; 10770 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1719 `libs/summary/domain/services/reader-summary-top-read-title.ts`
- Baseline evidence: blob `62b62d3db00517115549eb4171261b92d59c7bb1`; 1242 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1720 `libs/summary/domain/services/reader-summary-topic-claim-label-policy.ts`
- Baseline evidence: blob `22d9c7e873c7fd5f2de6ffdce1991902a55bd0d1`; 11128 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1721 `libs/summary/domain/services/reader-summary-topic-label-candidates.ts`
- Baseline evidence: blob `4c6af895f2b432efea354200a90f5b943d84e0ad`; 14776 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1722 `libs/summary/domain/services/reader-summary-topic-label-plan.ts`
- Baseline evidence: blob `08b613103319ef49a12c1145585bbdf573a918c6`; 2100 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1723 `libs/summary/domain/services/reader-summary-topic-label-selection.ts`
- Baseline evidence: blob `637abbad77430437ad44ccdda2aa42e781e8ef4f`; 3795 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1724 `libs/summary/domain/services/reader-summary-topic-label-version-enrichment.ts`
- Baseline evidence: blob `4fed438827882e7f76f737a118485d32ecbb9197`; 2953 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1725 `libs/summary/domain/services/reader-summary-topic-label-vocabulary.ts`
- Baseline evidence: blob `4c7aec19d8a92abdce0d83406b749bcfca3a5856`; 2566 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1726 `libs/summary/domain/services/reader-summary-topic-lawsuit-alignment.ts`
- Baseline evidence: blob `e278b1fe44ce9f8378bd5bedea9d41df8da84e98`; 4217 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1727 `libs/summary/domain/services/reader-summary-topic-map-aggregation.ts`
- Baseline evidence: blob `3153dff5cda098f67e440b205db710a62448d0e6`; 8261 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1728 `libs/summary/domain/services/reader-summary-topic-map-builder.ts`
- Baseline evidence: blob `8cc3c5c120e9b1fd67f9a7a0096692b697b3c30d`; 17277 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1729 `libs/summary/domain/services/reader-summary-topic-map-label-quality.ts`
- Baseline evidence: blob `2402099507ea6d481b698e03b992e6d72119c79d`; 8429 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1730 `libs/summary/domain/services/reader-summary-topic-map-structure.ts`
- Baseline evidence: blob `bc23846d2b1422595e9795877cd85c8ccb550f1c`; 5449 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1731 `libs/summary/domain/services/reader-summary-topic-map-text.ts`
- Baseline evidence: blob `a5bc858e420a2ee0f0a7dd903e2d95f1831d058d`; 3287 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1732 `libs/summary/domain/services/reader-summary-topic-node-label-sanitizer.ts`
- Baseline evidence: blob `13961312a5fd43ea4fb9cc7de0e760e052573546`; 1103 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1733 `libs/summary/domain/services/reader-summary-topic-relation-candidates.ts`
- Baseline evidence: blob `51a9871d66c9b1482faae58c9d66462466747a22`; 10275 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1734 `libs/summary/domain/services/reader-summary-topic-relation-reconciliation.ts`
- Baseline evidence: blob `bb1c59b51f5ccdbb0dee68393dc3f57b499dc330`; 6702 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1735 `libs/summary/domain/services/reader-summary-trend-delta.ts`
- Baseline evidence: blob `4630a788986e777218a7d09928c5d11bbe733e33`; 1719 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1736 `libs/summary/domain/services/story-cluster-membership.ts`
- Baseline evidence: blob `29617f3359fb9562b94e25e5d25b021358e4a654`; 14392 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1737 `libs/summary/domain/services/story-cluster-signal.ts`
- Baseline evidence: blob `66fc2e215f50cf7b375ff705c73be6d456937add`; 5303 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1738 `libs/summary/domain/services/story-clustering-facts.ts`
- Baseline evidence: blob `f62dc062acce9331f7d472052f382b8d53f223f9`; 2160 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1739 `libs/summary/domain/services/story-clustering.service.ts`
- Baseline evidence: blob `29f83fbedab1ebb067964834b583a9b3815f2586`; 11127 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1740 `libs/summary/domain/services/story-identity-token-classification.ts`
- Baseline evidence: blob `895c1f859cdfb03f3b6f1ec39551149903fa3e9a`; 367 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1741 `libs/summary/domain/services/story-key-normalizer.ts`
- Baseline evidence: blob `502d584537a1751d4c1605b9ecb600acb75d0d32`; 10351 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1742 `libs/summary/domain/services/story-news-verification-evidence.ts`
- Baseline evidence: blob `44f91cb460e606299aa272cda27f200e66220adb`; 572 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1743 `libs/summary/domain/services/story-ranking-telemetry.ts`
- Baseline evidence: blob `0a978c6f19aa52d8657529c16fcaa585deee06c4`; 5108 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1744 `libs/summary/domain/services/story-relation-candidates.ts`
- Baseline evidence: blob `7fa2440c2f41d3e8360f9cd01c062d85306f40e6`; 8801 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1745 `libs/summary/domain/services/story-relation-decision-trace.ts`
- Baseline evidence: blob `17b9c49af3998c5a6f41907c91afbc2ab1c9b68e`; 14662 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1746 `libs/summary/domain/services/story-relation-safe-recall-shadow-decision.ts`
- Baseline evidence: blob `2cac1909e7067aab430cd5aead4c63fe435868e4`; 5141 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1747 `libs/summary/domain/services/story-relation-safe-recall-shadow.ts`
- Baseline evidence: blob `a4fcf7eab8569394cddb4a33b4623c1825ab2738`; 8982 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1748 `libs/summary/domain/services/story-relation-title-evidence.ts`
- Baseline evidence: blob `dad69ddb0e772769ff94f8e21a9ec6713b255666`; 3580 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1749 `libs/summary/domain/services/story-release-event-clause-boundaries.ts`
- Baseline evidence: blob `ac5e0f130a51624b19064ff82516dfa1e3f68a68`; 4820 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1750 `libs/summary/domain/services/story-release-event-clauses.ts`
- Baseline evidence: blob `978cccf67b7b2aa0cae54165328d60fd26478e30`; 6923 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1751 `libs/summary/domain/services/story-release-event-description-boundaries.spec-support.ts`
- Baseline evidence: blob `faa65bdb106be6b403762c8025237861e06bad2a`; 5808 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1752 `libs/summary/domain/services/story-release-event-description.spec-support.ts`
- Baseline evidence: blob `1bbd3c9bed92921361934d0675c0ff3e646a96d4`; 5297 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1753 `libs/summary/domain/services/story-release-event-description.ts`
- Baseline evidence: blob `5b8bc74f72d9913ebbfc27e6cbfddc4bf61ec958`; 10226 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1754 `libs/summary/domain/services/story-release-event-identity-review.spec-support.ts`
- Baseline evidence: blob `1b7e3e04a0274abf2e60a01535137a93ca9684b0`; 19082 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1755 `libs/summary/domain/services/story-release-event-identity.spec-support.ts`
- Baseline evidence: blob `57ac6b8f10b3c891bfd6559f439ddc0a1229138e`; 5218 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1756 `libs/summary/domain/services/story-release-event-identity.ts`
- Baseline evidence: blob `f31ad8786529343047d114fa8a97be310fb8f78a`; 22910 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1757 `libs/summary/domain/services/story-release-event-primary-grammar.spec-support.ts`
- Baseline evidence: blob `76c94b45f5058d3bd1b66a729132b384a41ee39b`; 8066 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1758 `libs/summary/domain/services/story-release-event-primary.spec-support.ts`
- Baseline evidence: blob `609a60d04564a5f25dc18bbf9970538c1279c028`; 17567 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1759 `libs/summary/domain/services/story-release-event-workload.spec-support.ts`
- Baseline evidence: blob `ccc7c5b7b8b7d2bfe737dc172f33750e37248b49`; 2916 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1760 `libs/summary/domain/services/story-source-identity.ts`
- Baseline evidence: blob `615a789c0b3a83bb7d999724cf5da3d9797f41c1`; 7003 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1761 `libs/summary/domain/services/story-topic-tokenizer.ts`
- Baseline evidence: blob `d6770f78e1371867cb34cd0da2642c8df63d4c58`; 13333 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1762 `libs/summary/domain/value-objects/github-repository-identity.ts`
- Baseline evidence: blob `4a9e239062fcdc88b6576cc4b9b8b101beea275d`; 1163 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1763 `libs/summary/domain/value-objects/preview-media.ts`
- Baseline evidence: blob `0a8e5aac5a1e8b9f47f03c484d9691b4910e27b1`; 202 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1764 `libs/summary/domain/value-objects/provider-metric-label.ts`
- Baseline evidence: blob `78b44a9cd5798ed83f8714c13180cff993e558f1`; 765 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1765 `libs/summary/domain/value-objects/reader-promotion-diagnostics.ts`
- Baseline evidence: blob `4a845cb0ad7cac9783d178914acc37976b09c1bd`; 5934 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1766 `libs/summary/domain/value-objects/reader-summary-coverage-mode.ts`
- Baseline evidence: blob `248c2b0a8e8d1431ae74d20491e3de108fcb7eed`; 76 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1767 `libs/summary/domain/value-objects/reader-summary-daily-generation-input.ts`
- Baseline evidence: blob `6cacf56a95e1634fcabef5b86a22f34297430a3e`; 5315 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1768 `libs/summary/domain/value-objects/reader-summary-daily-model-job.ts`
- Baseline evidence: blob `2e5c317b2f3f0b12dd47c41717e2e82c4e621ce5`; 2580 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1769 `libs/summary/domain/value-objects/reader-summary-editorial-slate.ts`
- Baseline evidence: blob `4a3df8be55f3af76c413cdbbe0885a5874d17a14`; 2198 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1770 `libs/summary/domain/value-objects/reader-summary-headline-equivalence.ts`
- Baseline evidence: blob `2c05bc5cb55a9a60b23343dfd255696ead6bfc56`; 499 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1771 `libs/summary/domain/value-objects/reader-summary-period.ts`
- Baseline evidence: blob `5e1002d0834b97970e4d4267fa829a6b062191b0`; 12859 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1772 `libs/summary/domain/value-objects/reader-summary-preparation.ts`
- Baseline evidence: blob `b70b477bfe96837c7cc3d4693d5aa21429bff160`; 12051 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1773 `libs/summary/domain/value-objects/reader-summary-provider-identity.ts`
- Baseline evidence: blob `2dcefab02b3af38be44f2a7792fdf6a71f9c1e20`; 4055 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1774 `libs/summary/domain/value-objects/reader-summary-related-topic-relation.ts`
- Baseline evidence: blob `b641cb1c704dd702717a29505a93b6b7c3be40cf`; 7387 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1775 `libs/summary/domain/value-objects/reader-summary-scope.ts`
- Baseline evidence: blob `0d779eded214c87236553324b3c43582176f400f`; 1402 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1776 `libs/summary/domain/value-objects/reader-summary-v3-publication-array-paths.ts`
- Baseline evidence: blob `6c6af320fea40a875182fe15e4ce90825b69def9`; 1520 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1777 `libs/summary/domain/value-objects/reader-summary-weekly-canonical-json.ts`
- Baseline evidence: blob `c3167a2eae07652db0424efb8c0f9a515becef6e`; 15170 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1778 `libs/summary/domain/value-objects/reader-summary-weekly-certification-seal.ts`
- Baseline evidence: blob `d5ee23f5697ac8e8588e217f989fd6fc0fb3521b`; 6940 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1779 `libs/summary/domain/value-objects/reader-summary-weekly-daily-certification.ts`
- Baseline evidence: blob `d18e8af8e49dc35486f54c96090f0284ba845efb`; 21912 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1780 `libs/summary/domain/value-objects/reader-summary-weekly-exact-values.ts`
- Baseline evidence: blob `cee4606bf6e35541ab0d3f3674f092e8a8294018`; 3151 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1781 `libs/summary/domain/value-objects/reader-summary-weekly-github-audit.ts`
- Baseline evidence: blob `afb07c752b7f9ca87ec069527b5ee788efb5f8c2`; 8740 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1782 `libs/summary/domain/value-objects/reader-summary-weekly-github-source-evidence.ts`
- Baseline evidence: blob `b77590ab59679a8b7381d1df1d2e06c7ea31cfd3`; 12442 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1783 `libs/summary/domain/value-objects/reader-summary-weekly-input-manifest-canonical.ts`
- Baseline evidence: blob `485b98cf8252bcdd217fd308e218662a887eb452`; 15086 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1784 `libs/summary/domain/value-objects/reader-summary-weekly-input-manifest.ts`
- Baseline evidence: blob `fd3c856418bc90adf829d45d6cc1122669ccfa47`; 11891 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1785 `libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence-validation.ts`
- Baseline evidence: blob `cbfcba87b81198e39fe7aa1ffa511cb12fad46bc`; 9029 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1786 `libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence.ts`
- Baseline evidence: blob `2cbc74593bb03661f0fd477102d65480b6531d87`; 12170 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1787 `libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence-mode.ts`
- Baseline evidence: blob `7dd2a78f433d14ab95a2d4031e32b447c9227ff4`; 6234 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1788 `libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence.ts`
- Baseline evidence: blob `aec235371b698183a85a4401ed79943d9358ab96`; 12345 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1789 `libs/summary/domain/value-objects/reader-summary-weekly-review-execution-attestation.ts`
- Baseline evidence: blob `6324c4f71b1bc6f2305c73f0809dba0357cdeb90`; 5549 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1790 `libs/summary/domain/value-objects/reader-summary-weekly-review-manifest.ts`
- Baseline evidence: blob `2cc987eaec475f61aa041a20f5224c7d9992cb3b`; 29698 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1791 `libs/summary/domain/value-objects/reader-summary-weekly-story-authority.ts`
- Baseline evidence: blob `1a6ecf254a0553e5072f27e514c77b90cceae238`; 11605 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1792 `libs/summary/domain/value-objects/reader-summary-weekly-story-identity.ts`
- Baseline evidence: blob `a4acb3804dbf03f7fbb1e14ef30dd42c823550fc`; 6192 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1793 `libs/summary/domain/value-objects/signal-score.ts`
- Baseline evidence: blob `869d10e2f7ea9752c679f719e066d68b481724b1`; 301 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1794 `libs/summary/domain/value-objects/summary-evidence-item.ts`
- Baseline evidence: blob `364aacae5a1598cdc14588cf63ec795b1ee0b3b7`; 9180 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1795 `libs/summary/domain/value-objects/summary-quality.ts`
- Baseline evidence: blob `3dffcfe8c71e8a1274519e79a4b6688473b232a6`; 571 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1796 `libs/summary/domain/value-objects/summary-reader-headline.ts`
- Baseline evidence: blob `bcadf339ff46856790022fcf727170511b125b30`; 1744 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1797 `libs/summary/domain/value-objects/summary-text.ts`
- Baseline evidence: blob `7d2647f4dcc443ac80d7fede6369b53706349a07`; 1612 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1798 `libs/summary/domain/value-objects/summary-window.ts`
- Baseline evidence: blob `5cd5d90f9244049ee94dc6ab2090755a68652e8b`; 220 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: domain policy/model; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: domain policy assertions and wire-equivalence fixtures; architecture/typecheck/source-cap and final-HEAD native gates.
### 1799 `libs/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.command.ts`
- Baseline evidence: blob `6b8b205037774d29d28404bb71e11f07af2b32c8`; 802 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1800 `libs/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case.ts`
- Baseline evidence: blob `91c3f569974e725e0c87d8fe9bb8983e8b707167`; 15103 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1801 `libs/summary/features/build-reader-summary-weekly-story-observation/build-reader-summary-weekly-story-observation.command.ts`
- Baseline evidence: blob `9d3866233186ae95d478c2a02f53a818d300124d`; 660 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1802 `libs/summary/features/build-reader-summary-weekly-story-observation/build-reader-summary-weekly-story-observation.use-case.ts`
- Baseline evidence: blob `ff1c0cf6c2e9f67263c10ae0474b5d61f53fe186`; 2086 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1803 `libs/summary/features/build-summary-cost-attribution/build-summary-cost-attribution.command.ts`
- Baseline evidence: blob `4ba1102a22b0ee4b2ee1260cd26b4db0e13d2ffd`; 591 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1804 `libs/summary/features/build-summary-cost-attribution/build-summary-cost-attribution.result.ts`
- Baseline evidence: blob `39604dfa725426c0e50eabd0e2418d1636e8ce50`; 2064 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1805 `libs/summary/features/build-summary-cost-attribution/build-summary-cost-attribution.use-case.ts`
- Baseline evidence: blob `363fba4b959c2c7ff96d85df5b33a3f4a67002a2`; 8131 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1806 `libs/summary/features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.command.ts`
- Baseline evidence: blob `2a1ad16b8568b0b41fb8e7bb3b4c1fce8854d5c9`; 657 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1807 `libs/summary/features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.result.ts`
- Baseline evidence: blob `bb08effce4a3a21161a7ea534b70052c80d86b86`; 509 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1808 `libs/summary/features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.use-case.ts`
- Baseline evidence: blob `da1358bab4c640b4f836d5679e323cfbd67c5c3c`; 13528 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1809 `libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.command.ts`
- Baseline evidence: blob `1b19390f6d45758961b0acfc31db83e44247a0f1`; 1272 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1810 `libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.result.ts`
- Baseline evidence: blob `edc190bf2029d3c92c6ab79b69baeeadd3892f3e`; 1112 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1811 `libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.use-case.ts`
- Baseline evidence: blob `418e8ad886e927d3024f3f9f001a4d87a5d6c73a`; 9494 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1812 `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job-promotion-control.spec-support.ts`
- Baseline evidence: blob `32363df9575e9e5554bd484d55c5bc7b8c55a649`; 11480 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1813 `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job-support.ts`
- Baseline evidence: blob `a2b90169877d79cb78c5a9ed9dd7e6b299e50940`; 7945 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1814 `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.command.ts`
- Baseline evidence: blob `29fe2b5b4ed994183e303722a1c98d8153a7171e`; 399 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1815 `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.result.ts`
- Baseline evidence: blob `224e0013f14b87140e31a5b34730e408292f9134`; 229 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1816 `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.spec-support.ts`
- Baseline evidence: blob `15d0bffdb64af0a104f1e126c91d08779fd13081`; 3125 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1817 `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case.ts`
- Baseline evidence: blob `32ed8eb29dacabe4679cea880c566c3536823b82`; 24169 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1818 `libs/summary/features/execute-reader-summary-job/publish-reader-summary-job.ts`
- Baseline evidence: blob `dc2b32f3516744c363ba9fd05fd12ca1b16f3ff0`; 3252 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1819 `libs/summary/features/execute-reader-summary-job/reader-summary-context-unavailable.ts`
- Baseline evidence: blob `77775b80df52a56653974f8a85a8532cd1fd8186`; 1623 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1820 `libs/summary/features/execute-reader-summary-job/reader-summary-cutoff.spec-support.ts`
- Baseline evidence: blob `0f36a5164d6fad5509e04521bc3ca2e28478ed34`; 3154 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1821 `libs/summary/features/execute-reader-summary-job/reader-summary-daily-editorial-generation.ts`
- Baseline evidence: blob `1703a0d7b0b8a14c84af62ca9715d64ce086c397`; 2930 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1822 `libs/summary/features/execute-reader-summary-job/reader-summary-execution-lease.policy.ts`
- Baseline evidence: blob `a9e34bdec2ea410543f430ec44a9c15a88bf821b`; 910 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1823 `libs/summary/features/execute-reader-summary-job/reader-summary-first-publication-execution.ts`
- Baseline evidence: blob `7d924940b9518fa81e5b0f382168e830e7973b34`; 6036 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1824 `libs/summary/features/execute-reader-summary-job/reader-summary-historical-omission-quality.ts`
- Baseline evidence: blob `9de47694b4b17cf64dab54084c2762ff7a5644fe`; 642 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1825 `libs/summary/features/execute-reader-summary-job/reader-summary-job-execution.ts`
- Baseline evidence: blob `ead128dc87f21fd431ca87a70879df9cd472b474`; 1463 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1826 `libs/summary/features/execute-reader-summary-job/reader-summary-missing-github-projection.ts`
- Baseline evidence: blob `e01359b8b4cef2fedf8a07c1f6283ee6efaf02bb`; 3496 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1827 `libs/summary/features/execute-reader-summary-job/reader-summary-model-artifact.ts`
- Baseline evidence: blob `4787cfc26adebd396dcbabe1e7e49de04a8dff05`; 2326 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1828 `libs/summary/features/execute-reader-summary-job/reader-summary-prepublication-gate.ts`
- Baseline evidence: blob `f0ce2d301d8cac87ef385055877da1c2a99bc0ee`; 10055 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1829 `libs/summary/features/execute-reader-summary-job/reader-summary-promotion-artifact-fields.ts`
- Baseline evidence: blob `782b9ce98e96879bde92a0fa38383b4ad42af3d1`; 2404 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1830 `libs/summary/features/execute-reader-summary-job/reader-summary-promotion-content.ts`
- Baseline evidence: blob `0df49b87ff8b9f30550d31195e0ceeb1eb994107`; 4428 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1831 `libs/summary/features/execute-reader-summary-job/reader-summary-promotion-control.ts`
- Baseline evidence: blob `c88cf0eab7410e06895ff38725d282cc70061fad`; 1931 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1832 `libs/summary/features/execute-reader-summary-job/reader-summary-promotion-no-signal.ts`
- Baseline evidence: blob `800f66598a5b856e4a94b8b4b70a16e1fbc31389`; 2863 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1833 `libs/summary/features/execute-reader-summary-job/reader-summary-v3-execution.ts`
- Baseline evidence: blob `b6b19fdd7bbc44142c887b4c0b7fd228b049916f`; 4892 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1834 `libs/summary/features/execute-summary-job/execute-summary-job.command.ts`
- Baseline evidence: blob `e3ace9542fd6d4713112f884c40c606a24e9ae2c`; 260 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1835 `libs/summary/features/execute-summary-job/execute-summary-job.result.ts`
- Baseline evidence: blob `a61553bc44199ccd49fc980af9adfac6319555f8`; 199 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1836 `libs/summary/features/execute-summary-job/execute-summary-job.use-case.ts`
- Baseline evidence: blob `10e61548e9c1c6d7e88219c42b1b5ce9dfdac4f0`; 9272 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1837 `libs/summary/features/export-summary-feedback-samples/export-summary-feedback-samples.command.ts`
- Baseline evidence: blob `fdcf2e3764e7bf8c01127508a9f5f6df936e3c8d`; 917 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1838 `libs/summary/features/export-summary-feedback-samples/export-summary-feedback-samples.result.ts`
- Baseline evidence: blob `e5e7543749b8a3f483e04bd588aa18b5d7f96a2d`; 2093 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1839 `libs/summary/features/export-summary-feedback-samples/export-summary-feedback-samples.use-case.ts`
- Baseline evidence: blob `02acf4468f4dfe4821333ca7b3b43acc39a9ed06`; 9088 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1840 `libs/summary/features/generate-reader-summary-weekly-artifact/generate-reader-summary-weekly-artifact.command.ts`
- Baseline evidence: blob `cda031ff5bdd508f26682ef0ac2e5b33c772238c`; 206 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1841 `libs/summary/features/generate-reader-summary-weekly-artifact/generate-reader-summary-weekly-artifact.use-case.ts`
- Baseline evidence: blob `64df29a7106f6c715f07d783185ee4ee51f6bfd5`; 1011 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1842 `libs/summary/features/get-reader-summary-job-status/get-reader-summary-job-status.query.ts`
- Baseline evidence: blob `57c89597c8a62809d086d097c8d95e9fc43fd84f`; 234 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1843 `libs/summary/features/get-reader-summary-job-status/get-reader-summary-job-status.result.ts`
- Baseline evidence: blob `26281ba3b9ec7da4bdbedb5e26e00f7da04fc8eb`; 1043 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1844 `libs/summary/features/get-reader-summary-job-status/get-reader-summary-job-status.use-case.ts`
- Baseline evidence: blob `2839e72d4e1f33b5cfc5888aae1d82fb7dcf087f`; 4120 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1845 `libs/summary/features/get-reader-summary-quality-rejection/get-reader-summary-quality-rejection.query.ts`
- Baseline evidence: blob `74a481574ca3469a00fbd3bf0b871788746448af`; 241 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1846 `libs/summary/features/get-reader-summary-quality-rejection/get-reader-summary-quality-rejection.result.ts`
- Baseline evidence: blob `de9788f770d344685f02b17c595a220562bc63c8`; 1642 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1847 `libs/summary/features/get-reader-summary-quality-rejection/get-reader-summary-quality-rejection.use-case.ts`
- Baseline evidence: blob `161d93ea52150a2337f6a1054aa6520419cf8910`; 2682 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1848 `libs/summary/features/get-reader-summary-weekly-projection/get-reader-summary-weekly-projection.use-case.ts`
- Baseline evidence: blob `942ed743fe31f6031e5f6b087ebf39f1c445d302`; 7465 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1849 `libs/summary/features/get-reader-summary/get-reader-summary.query.ts`
- Baseline evidence: blob `a58cb9e485ae7e7dee32fcdeceaaa7d3399a0347`; 222 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1850 `libs/summary/features/get-reader-summary/get-reader-summary.result.ts`
- Baseline evidence: blob `a6cb186442e5575d85fef7102b4f3ac6d787ac35`; 159 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1851 `libs/summary/features/get-reader-summary/get-reader-summary.use-case.ts`
- Baseline evidence: blob `48d21684e09ff79d79baf2ea96e7446fe91e077b`; 2727 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1852 `libs/summary/features/get-summary-job-status/get-summary-job-status.query.ts`
- Baseline evidence: blob `1a60f487cbfa3acf600d167824c037fc999c22f1`; 222 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1853 `libs/summary/features/get-summary-job-status/get-summary-job-status.result.ts`
- Baseline evidence: blob `5574bf06b3eb78c8a6a7dd6600b156eec006939e`; 590 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1854 `libs/summary/features/get-summary-job-status/get-summary-job-status.use-case.ts`
- Baseline evidence: blob `7d2301df076cb518e37905a974d17d5d10b75525`; 2640 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1855 `libs/summary/features/get-summary-policy/get-summary-policy.query.ts`
- Baseline evidence: blob `38184c1ce06c6fe5ee97f88fbef28d1d6d54c262`; 217 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1856 `libs/summary/features/get-summary-policy/get-summary-policy.result.ts`
- Baseline evidence: blob `53c58e6bab35ec01015f65ec93726dd05a2b9551`; 199 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1857 `libs/summary/features/get-summary-policy/get-summary-policy.use-case.ts`
- Baseline evidence: blob `eb7cbc57739f02bc2c2d767a82f17fed0dcd9696`; 1505 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1858 `libs/summary/features/get-summary/get-summary.query.ts`
- Baseline evidence: blob `2bdee096649907f458b03ba252c9d5bc324d16f3`; 210 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1859 `libs/summary/features/get-summary/get-summary.result.ts`
- Baseline evidence: blob `bac81b66a09233b5ba9647e6fb935093038c2f4a`; 134 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1860 `libs/summary/features/get-summary/get-summary.use-case.ts`
- Baseline evidence: blob `af02e26f85683bb0bb033bcac49dea468633b30c`; 1357 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1861 `libs/summary/features/list-reader-posts/list-reader-posts.use-case.ts`
- Baseline evidence: blob `12fff171990d26b9c5bce22c7d2ad0462cba7f6f`; 3849 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1862 `libs/summary/features/list-reader-summaries/list-reader-summaries.query.ts`
- Baseline evidence: blob `add97a5b22eea287db2b0441bfde8170f6437712`; 767 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1863 `libs/summary/features/list-reader-summaries/list-reader-summaries.result.ts`
- Baseline evidence: blob `4af0a99dafeffffb0b9d8513db6b8ad2d9e46883`; 228 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1864 `libs/summary/features/list-reader-summaries/list-reader-summaries.use-case.ts`
- Baseline evidence: blob `4f9ce62492e529245a26ed049625a1f26c2ed96d`; 7843 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1865 `libs/summary/features/list-reader-summary-periods/list-reader-summary-periods.query.ts`
- Baseline evidence: blob `ec2d0d5a8b0144de7ea7b182798da4ca02ee6aa3`; 583 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1866 `libs/summary/features/list-reader-summary-periods/list-reader-summary-periods.result.ts`
- Baseline evidence: blob `6a8fba0d099495c49a3edfec2665d5281d35e22e`; 243 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1867 `libs/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case.ts`
- Baseline evidence: blob `95bc5492dfc580c1257703c9ef39229976916678`; 1103 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1868 `libs/summary/features/list-reader-summary-topic-recommendations/list-reader-summary-topic-recommendations.query.ts`
- Baseline evidence: blob `7b1a60a34e62131b79f9373ac66d0cba9b739df6`; 360 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1869 `libs/summary/features/list-reader-summary-topic-recommendations/list-reader-summary-topic-recommendations.result.ts`
- Baseline evidence: blob `adc58e588fa3f7d3a91890081ee54d0d4372e63a`; 263 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1870 `libs/summary/features/list-reader-summary-topic-recommendations/list-reader-summary-topic-recommendations.use-case.ts`
- Baseline evidence: blob `4264d78f5cefdcfda156f0c1ed1834edf7141370`; 7954 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1871 `libs/summary/features/list-summaries/list-summaries.query.ts`
- Baseline evidence: blob `b2bc472b0fadacaceaa2c776e8da8e2f3d16f783`; 269 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1872 `libs/summary/features/list-summaries/list-summaries.result.ts`
- Baseline evidence: blob `3eca0cf800e535f8e392b71ffca3f28a06f0aed9`; 203 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1873 `libs/summary/features/list-summaries/list-summaries.use-case.ts`
- Baseline evidence: blob `869b3efb2de14f99892c9ad0b09a12bd84b698ef`; 1714 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1874 `libs/summary/features/list-summary-feedback/list-summary-feedback.query.ts`
- Baseline evidence: blob `68a5cbfa681a76739b2f7b440dcab9c4ebc9298b`; 273 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1875 `libs/summary/features/list-summary-feedback/list-summary-feedback.result.ts`
- Baseline evidence: blob `280c875ff5e22f6e0ccf5f513da2e0fa7256a3b7`; 209 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1876 `libs/summary/features/list-summary-feedback/list-summary-feedback.use-case.ts`
- Baseline evidence: blob `d6b6c7cf81dba5dff30c75f0b442e3288afdc9b1`; 1704 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1877 `libs/summary/features/load-user-context-for-summary/load-user-context-for-summary.query.ts`
- Baseline evidence: blob `af424e0e02acb92c9c156b7f59897af4fa088079`; 453 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1878 `libs/summary/features/load-user-context-for-summary/load-user-context-for-summary.result.ts`
- Baseline evidence: blob `1b2ad35e9db66775aa468aad3b9943e4ea0aac1f`; 151 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1879 `libs/summary/features/load-user-context-for-summary/load-user-context-for-summary.use-case.ts`
- Baseline evidence: blob `d7b80aafc7489f6119afb08ca495f71457ea616c`; 1788 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1880 `libs/summary/features/publish-reader-summary-weekly-certified-artifact/publish-reader-summary-weekly-certified-artifact.use-case.ts`
- Baseline evidence: blob `43bd0f578e8ea6e346a45c3ed56d406298a41e35`; 4915 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1881 `libs/summary/features/record-summary-feedback/record-summary-feedback.command.ts`
- Baseline evidence: blob `8f53052ce5bb73fabcaaa57e2e0274915786186d`; 529 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1882 `libs/summary/features/record-summary-feedback/record-summary-feedback.result.ts`
- Baseline evidence: blob `dc08976270d0a4fa09718e0c6ff18ac3f65795ff`; 440 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1883 `libs/summary/features/record-summary-feedback/record-summary-feedback.use-case.ts`
- Baseline evidence: blob `e04415536fd90f4060b4232bb8db6ae29a3ce783`; 8850 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1884 `libs/summary/features/regenerate-summary/regenerate-summary.command.ts`
- Baseline evidence: blob `866f978590b92591015f3e496fda666ed10a307a`; 288 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1885 `libs/summary/features/regenerate-summary/regenerate-summary.result.ts`
- Baseline evidence: blob `e763f188e7e2dcf57c2d8ec163d094a9bbd132a0`; 197 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1886 `libs/summary/features/regenerate-summary/regenerate-summary.use-case.ts`
- Baseline evidence: blob `f59dd47a73a28a570ebb2930777fc2aa4ba0fac4`; 2821 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1887 `libs/summary/features/request-reader-summary/request-reader-summary.command.ts`
- Baseline evidence: blob `f44cf93edd191776ff082913fb1e02f59f2ca4a6`; 715 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1888 `libs/summary/features/request-reader-summary/request-reader-summary.result.ts`
- Baseline evidence: blob `e6eeb4011a1513511ebf71de07c3b4a77248dd63`; 444 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1889 `libs/summary/features/request-reader-summary/request-reader-summary.use-case.ts`
- Baseline evidence: blob `938f0cec94a5d1f77549095c04248875def5e8bd`; 11079 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1890 `libs/summary/features/request-summary/request-summary.command.ts`
- Baseline evidence: blob `5621be349f9a17f112416f4373615a96e46ab90d`; 350 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1891 `libs/summary/features/request-summary/request-summary.result.ts`
- Baseline evidence: blob `6ca2fbf4e0a9c9ba9536c6e64b04ccab7c4f5e16`; 194 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1892 `libs/summary/features/request-summary/request-summary.use-case.ts`
- Baseline evidence: blob `c0ec6d3f3ce875889369980fb3fe37b4d0f8c283`; 4072 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1893 `libs/summary/features/schedule-auto-summaries/schedule-auto-summaries.command.ts`
- Baseline evidence: blob `ce1c9f6263f1989ffddae83c08ce58d534afb34a`; 302 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1894 `libs/summary/features/schedule-auto-summaries/schedule-auto-summaries.result.ts`
- Baseline evidence: blob `314ce129d7b128c7fa29ca5eace1358cdc0f4fb4`; 679 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1895 `libs/summary/features/schedule-auto-summaries/schedule-auto-summaries.use-case.ts`
- Baseline evidence: blob `cd03f8e0326173024abf7898f9888b55ff32bcc3`; 3459 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1896 `libs/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.command.ts`
- Baseline evidence: blob `057c01f51b97f7ebccf4470b762aa8b26e2adb86`; 414 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1897 `libs/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.result.ts`
- Baseline evidence: blob `2a6458fe8e62e6bfda68e875db70dc7a16366425`; 1015 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1898 `libs/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case.ts`
- Baseline evidence: blob `a447bdb1e3b5e81b4553a21eeaaf8381ca7e7ac8`; 9047 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1899 `libs/summary/features/shared/reader-summary-artifact-presenter.ts`
- Baseline evidence: blob `e3bb4d4d89106aaebe6265a9df6a4ebe45f15399`; 14858 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1900 `libs/summary/features/shared/reader-summary-coverage-presenter.ts`
- Baseline evidence: blob `2dba32f7218527b7df9d62618c4be2b63363d65d`; 12526 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1901 `libs/summary/features/shared/reader-summary-freshness-presenter.ts`
- Baseline evidence: blob `431c8ce5d1ac5da1fb8a7e82a81fafc006fcbbc5`; 1789 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1902 `libs/summary/features/shared/reader-summary-list-query-validation.ts`
- Baseline evidence: blob `e334b367a55f96f56b172d837aa9aea91e660751`; 2889 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1903 `libs/summary/features/shared/reader-summary-v3-artifact-presenter.ts`
- Baseline evidence: blob `81d9256f547b5441e5ecc4cfc87f3d16e54ec4b1`; 676 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1904 `libs/summary/features/shared/summary-artifact-presenter.ts`
- Baseline evidence: blob `30e34ef016f5c0789e7191936b5a03e6fc74e0aa`; 2413 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1905 `libs/summary/features/shared/summary-citation-validator.ts`
- Baseline evidence: blob `71cad956d7c906b00a3e618f8c0ba9aa093f1085`; 2986 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1906 `libs/summary/features/shared/summary-feedback-presenter.ts`
- Baseline evidence: blob `fbcccd25841d52371785b0390374d3a20b22bd3e`; 1464 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1907 `libs/summary/features/shared/summary-policy-presenter.ts`
- Baseline evidence: blob `7d4813e31c970076e1631051bebbef3140c552f4`; 1122 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1908 `libs/summary/features/upsert-summary-policy/upsert-summary-policy.command.ts`
- Baseline evidence: blob `40fb10ea052593d63af695bc2ffb7a862e2fc3c7`; 634 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1909 `libs/summary/features/upsert-summary-policy/upsert-summary-policy.result.ts`
- Baseline evidence: blob `ab9be40f0acd318374023ad27d5aeba0c7b57623`; 190 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1910 `libs/summary/features/upsert-summary-policy/upsert-summary-policy.use-case.ts`
- Baseline evidence: blob `d1def4a5e592ae38b8453ae2989a1a1b223462f8`; 2590 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1911 `libs/summary/interfaces/queue/execute-reader-summary-job-command.handler.ts`
- Baseline evidence: blob `668f0cbf7ac827b8ee7e42c93f2689a9f360ce14`; 7027 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1912 `libs/summary/interfaces/queue/execute-summary-job-command.handler.ts`
- Baseline evidence: blob `c32819e45449562b9b6f80d39ab6cb0349937c3b`; 5515 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1913 `libs/summary/interfaces/rest/reader-posts.controller.ts`
- Baseline evidence: blob `68eceab2bd1afec0c49021fbc08b67cae38a8c2d`; 4392 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1914 `libs/summary/interfaces/rest/reader-posts.dto.ts`
- Baseline evidence: blob `f764f7a27271ceb9d0417d5908f3b72b8ffb161c`; 1687 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1915 `libs/summary/interfaces/rest/reader-posts.providers.ts`
- Baseline evidence: blob `689e6ae72bd9124727c67583232c76c096f72db5`; 1803 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1916 `libs/summary/interfaces/rest/reader-summary-contract.constants.ts`
- Baseline evidence: blob `4c2fd16f85aea72c092e2a32c59b42133aa5b08c`; 1063 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1917 `libs/summary/interfaces/rest/reader-summary-coverage.dto.ts`
- Baseline evidence: blob `70e10bd677eb012969d7985bffab94e840393866`; 5080 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1918 `libs/summary/interfaces/rest/reader-summary-display-headline.dto.ts`
- Baseline evidence: blob `a77c5a113497be0fb0c0475b3e10fda02401b086`; 3772 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1919 `libs/summary/interfaces/rest/reader-summary-display-rest-binding.ts`
- Baseline evidence: blob `99eb6443536a0f6ba5554340e8d65871bf1e57ef`; 3287 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1920 `libs/summary/interfaces/rest/reader-summary-evidence.dto.ts`
- Baseline evidence: blob `045edf6a3204f2d8939eedaab96268f4417d7ae3`; 3716 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1921 `libs/summary/interfaces/rest/reader-summary-grounded-publication.spec-support.ts`
- Baseline evidence: blob `712da513c1e5235ccb4e0906a8889c518eeb464e`; 1965 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1922 `libs/summary/interfaces/rest/reader-summary-job-status.dto.ts`
- Baseline evidence: blob `8cd8360c498d2f88366e5689308a4c9635ccf5a2`; 5162 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1923 `libs/summary/interfaces/rest/reader-summary-job.controller.ts`
- Baseline evidence: blob `f4b4c4636f274f559f61f0cdedd215d7b65400d2`; 6735 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1924 `libs/summary/interfaces/rest/reader-summary-metadata.dto.ts`
- Baseline evidence: blob `e1835af60916166ec83b52917dabcc6a9f846b5d`; 3383 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1925 `libs/summary/interfaces/rest/reader-summary-promotion-attestation.dto.ts`
- Baseline evidence: blob `d39e62817911f398d1e2d852b609ffc3851e37d0`; 10878 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1926 `libs/summary/interfaces/rest/reader-summary-promotion-board-rest.mapper.ts`
- Baseline evidence: blob `cdda719737de46264e160c4b41db2b7685be9764`; 20117 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1927 `libs/summary/interfaces/rest/reader-summary-reader.dto.ts`
- Baseline evidence: blob `622dea692148c91d54e024d136c3323b65de7ad8`; 14460 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1928 `libs/summary/interfaces/rest/reader-summary-request.controller.ts`
- Baseline evidence: blob `6807815000453427f368854df1c79be5ac8bbe47`; 6868 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1929 `libs/summary/interfaces/rest/reader-summary-response.dto.ts`
- Baseline evidence: blob `2154e5cbeaf9478e873e25a0044bb6bd61c99123`; 5051 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1930 `libs/summary/interfaces/rest/reader-summary-rest-attestation.ts`
- Baseline evidence: blob `71274a2ebcac7064b514f705c14350f7095ef716`; 387 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1931 `libs/summary/interfaces/rest/reader-summary-rest.mapper.ts`
- Baseline evidence: blob `675af18e3b79554ca3ae53cdbeb0f71cffc26653`; 6687 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1932 `libs/summary/interfaces/rest/reader-summary-rest.view.ts`
- Baseline evidence: blob `0639c601327bc106de4849f48c91d80bc6d6b86e`; 2718 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1933 `libs/summary/interfaces/rest/reader-summary-scope-period.dto.ts`
- Baseline evidence: blob `84fae6bfbd774725896c024ec5900dc503de3bff`; 1787 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1934 `libs/summary/interfaces/rest/reader-summary-selection-strategy.resolver.ts`
- Baseline evidence: blob `5ec10b92385f5f97de879383a05430288d6e7150`; 5174 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1935 `libs/summary/interfaces/rest/reader-summary-title-projection.spec-support.ts`
- Baseline evidence: blob `09a0fab61359e2f3cb6a9717ea00b8264cf8fe46`; 4195 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1936 `libs/summary/interfaces/rest/reader-summary-topic-recommendation.controller.ts`
- Baseline evidence: blob `6a099cb9f2dce8e9f1c40ed0f217dd9da74ab3d4`; 9108 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1937 `libs/summary/interfaces/rest/reader-summary-topic-recommendation.dto.ts`
- Baseline evidence: blob `4cf32e2e55d654d90c5f8caae285e2d323bd901f`; 9704 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1938 `libs/summary/interfaces/rest/reader-summary-weekly-projection-rest.mapper.ts`
- Baseline evidence: blob `102e2c0123d83dd6da320c2d15e292f47dbf6afd`; 2151 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1939 `libs/summary/interfaces/rest/reader-summary-weekly-projection.controller.ts`
- Baseline evidence: blob `73e4b18110fc5baf82e489172fd2be3270225ed6`; 4002 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1940 `libs/summary/interfaces/rest/reader-summary-weekly-projection.dto.ts`
- Baseline evidence: blob `0ce0e91c8abda7e2bf7a026e1e2a51535e72e838`; 6450 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1941 `libs/summary/interfaces/rest/reader-summary.controller.ts`
- Baseline evidence: blob `ad420fa25508aa2ceff5f959d2e27376c14e008c`; 14971 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1942 `libs/summary/interfaces/rest/reader-summary.dto.ts`
- Baseline evidence: blob `808bbd24fd75e4b280e4e0b0a99f995621a6d1fb`; 1530 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1943 `libs/summary/interfaces/rest/regenerate-summary.dto.ts`
- Baseline evidence: blob `4f9d045f7f5858515c2ff73261529d2f4322f405`; 429 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1944 `libs/summary/interfaces/rest/request-reader-summary.dto.ts`
- Baseline evidence: blob `bef23d75ad059b66a030e7ab8fa70dd9cd840a60`; 2100 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1945 `libs/summary/interfaces/rest/request-summary.dto.ts`
- Baseline evidence: blob `eb8f9d3df1234fd896a87c01d8cdb547431f65e1`; 746 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1946 `libs/summary/interfaces/rest/source-assessment-runtime-provider-tokens.ts`
- Baseline evidence: blob `db0d8ec90538d87bfef110997670276c02e9ea73`; 2571 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1947 `libs/summary/interfaces/rest/summary-agent-runtime-provider-tokens.ts`
- Baseline evidence: blob `f67e4d78b1d9eefd5442525101eebeea5c8c8351`; 8632 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1948 `libs/summary/interfaces/rest/summary-agent-runtime.providers.ts`
- Baseline evidence: blob `e5f53e65049f3b9635501c04b148ee57f1dc049c`; 3549 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1949 `libs/summary/interfaces/rest/summary-conversation-persistence.providers.ts`
- Baseline evidence: blob `3688ca922c61c83d975a21b49fe5beb9ee0d34c2`; 2355 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1950 `libs/summary/interfaces/rest/summary-feedback.controller.ts`
- Baseline evidence: blob `fcd8575fca83ce6093627ec50ca06b578441f92f`; 8300 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1951 `libs/summary/interfaces/rest/summary-feedback.dto.ts`
- Baseline evidence: blob `54ed72cd44804afdea200d1b7210c39291a9ee4b`; 3161 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1952 `libs/summary/interfaces/rest/summary-job-status.dto.ts`
- Baseline evidence: blob `c6cc6a1bacc831e9dc6f4d1577ce256d7c6d6851`; 1349 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1953 `libs/summary/interfaces/rest/summary-job.controller.ts`
- Baseline evidence: blob `a239737d1b8a6a68d55b66e1fec00dee82744f26`; 3587 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1954 `libs/summary/interfaces/rest/summary-policy.controller.ts`
- Baseline evidence: blob `8a4b45eb1c57750ee6fc692eed7c1e06b716d80a`; 6460 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1955 `libs/summary/interfaces/rest/summary-policy.dto.ts`
- Baseline evidence: blob `efbd59199c2caf53e4877e8ed4d24651269951f3`; 1407 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1956 `libs/summary/interfaces/rest/summary-provider-token-map.ts`
- Baseline evidence: blob `3e6747ed980ceb0d98fcf954cc9f48391d6bdc6f`; 4908 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1957 `libs/summary/interfaces/rest/summary-provider-tokens.ts`
- Baseline evidence: blob `c1b8704ad996083e7c0185588b227ed79ce39857`; 14807 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1958 `libs/summary/interfaces/rest/summary-reader-summary-coverage.provider.ts`
- Baseline evidence: blob `c436533e05820ee317da486466fbe7ddd4dffde5`; 1744 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1959 `libs/summary/interfaces/rest/summary-reader-summary-persistence.providers.ts`
- Baseline evidence: blob `9a6a32e51fa74470ba3bc38ff7d100137bb2498a`; 4851 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1960 `libs/summary/interfaces/rest/summary-reader-summary-publication.provider.ts`
- Baseline evidence: blob `772a02f49814beb5fad2202394bd4a9ca4489b52`; 2172 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1961 `libs/summary/interfaces/rest/summary-reader-summary-v3.providers.ts`
- Baseline evidence: blob `79333b9b59fd1e2c554018908c9c18627a3ba474`; 3866 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1962 `libs/summary/interfaces/rest/summary-reader-summary.providers.ts`
- Baseline evidence: blob `e0dd888f3c208a0154e5ff936b46f57a117f51e5`; 20824 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1963 `libs/summary/interfaces/rest/summary-request.controller.ts`
- Baseline evidence: blob `ed1686b44e2ef497f23c218ee0a3ef49697871cb`; 4270 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1964 `libs/summary/interfaces/rest/summary-rest-infrastructure.module.ts`
- Baseline evidence: blob `f76c4d3b6b01b75fa8433290943e5c0cb5b2b49a`; 18388 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1965 `libs/summary/interfaces/rest/summary-rest.module.ts`
- Baseline evidence: blob `37680835f5b281022436ca2e47d4d3e71e594ab1`; 18185 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1966 `libs/summary/interfaces/rest/summary.controller.ts`
- Baseline evidence: blob `2a39773284fe92adebf8f88c7b4ba58f2413db42`; 8775 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1967 `libs/summary/interfaces/rest/summary.dto.ts`
- Baseline evidence: blob `725a860e35993fc1c5a4ff8ef2622fadc812596f`; 5320 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1968 `libs/summary/ports/agent-runtime-client.port.ts`
- Baseline evidence: blob `aaea96bd067d359b5b3d5c4a9efeebf08c97d9c0`; 3704 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1969 `libs/summary/ports/auto-summary-candidate-repository.port.ts`
- Baseline evidence: blob `581fb8da3587dc99389e5baf7533e935a84a60ee`; 958 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1970 `libs/summary/ports/index.ts`
- Baseline evidence: blob `88bcf17701d6e45443b27aec6f0b2f60043acb70`; 2416 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1971 `libs/summary/ports/reader-summary-accepted-topic-applier.port.ts`
- Baseline evidence: blob `8ddd38638d4329d42bf8a61252d51f6646a3f114`; 2693 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1972 `libs/summary/ports/reader-summary-artifact-repository.port.ts`
- Baseline evidence: blob `8babe9d4877676447c88b32e6773104457cbea42`; 4782 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1973 `libs/summary/ports/reader-summary-context-provider.port.ts`
- Baseline evidence: blob `5951faa45171a5973d76f85e03053e44226645cb`; 920 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1974 `libs/summary/ports/reader-summary-coverage-counter.port.ts`
- Baseline evidence: blob `565eadc91d9c66ef91715ff0e2c6d1b65985803b`; 2636 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1975 `libs/summary/ports/reader-summary-daily-bounded-maintenance-claim.port.ts`
- Baseline evidence: blob `a3c48a02649670f5f5eab8702e802959215f90b5`; 780 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1976 `libs/summary/ports/reader-summary-daily-execution-cursor.port.ts`
- Baseline evidence: blob `bf18ecff3a558807ed707162231f86662234a741`; 4014 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1977 `libs/summary/ports/reader-summary-evidence-selector.port.ts`
- Baseline evidence: blob `c18da5abc6e54e6c13db9503d03449c79d600bdc`; 1391 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1978 `libs/summary/ports/reader-summary-freshness.port.ts`
- Baseline evidence: blob `d61dfe35bee7abab67327f3e6665c171791d82ba`; 1031 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1979 `libs/summary/ports/reader-summary-github-projection-reader.port.ts`
- Baseline evidence: blob `66fb7baebd148e5e164258faaaf061be35a80673`; 4746 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1980 `libs/summary/ports/reader-summary-job-queue.port.ts`
- Baseline evidence: blob `c2d784bdc68a12c4d773e4253e37b3fbc4094e04`; 575 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1981 `libs/summary/ports/reader-summary-job-repository.port.ts`
- Baseline evidence: blob `0c5236a955eaed1c76308de4cffbc16cdc11a187`; 1889 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1982 `libs/summary/ports/reader-summary-model.port.ts`
- Baseline evidence: blob `15973a3b0aaa662e99490fdaf069efa6a3f11d04`; 3520 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1983 `libs/summary/ports/reader-summary-operator-cancellation.port.ts`
- Baseline evidence: blob `275c659396440ce9b5267d7346c5082027ba21a7`; 638 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1984 `libs/summary/ports/reader-summary-policy-repository.port.ts`
- Baseline evidence: blob `f02bc895b9a8c1961cff6f37d8cd398531ee09b9`; 797 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1985 `libs/summary/ports/reader-summary-preview-media-enricher.port.ts`
- Baseline evidence: blob `782fe3491c3150fde2166bd7183cd6d34af9dee9`; 643 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1986 `libs/summary/ports/reader-summary-production-recovery-authority.port.ts`
- Baseline evidence: blob `fa2a2e565dd213c0d1281c6fb2fa8e70617c0b9c`; 5874 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1987 `libs/summary/ports/reader-summary-provider-collection-health.port.ts`
- Baseline evidence: blob `07aff472f17783ae41eb576c476bdc052d342edc`; 1649 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1988 `libs/summary/ports/reader-summary-publication.port.ts`
- Baseline evidence: blob `f90e0cb545dd261f6b1f266a28289097decb895e`; 1311 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1989 `libs/summary/ports/reader-summary-recovery-finalization.port.ts`
- Baseline evidence: blob `bed7459a0ae3f50f434d04a0180095e1b94b334f`; 1422 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1990 `libs/summary/ports/reader-summary-story-relation-verifier.port.ts`
- Baseline evidence: blob `3e955c70d8714969cea8b44f80ebe6f9f97ec433`; 1693 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1991 `libs/summary/ports/reader-summary-topic-collection-metrics.port.ts`
- Baseline evidence: blob `763cbdce9546d134fd5bb1b7d47f1c41002db230`; 1249 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1992 `libs/summary/ports/reader-summary-topic-labeler.port.ts`
- Baseline evidence: blob `731ce0462a664604b0553aa9ea3e5d2fa346bd89`; 1695 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1993 `libs/summary/ports/reader-summary-topic-map-publication-audit.port.ts`
- Baseline evidence: blob `9f9acd246ebbab608b3a2c9ec5da6581ce945b56`; 624 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1994 `libs/summary/ports/reader-summary-topic-recommendation-decision-repository.port.ts`
- Baseline evidence: blob `cbf4a3c921ffafc6a9e3528fce8c20e678c8661f`; 1225 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1995 `libs/summary/ports/reader-summary-topic-relation-verifier.port.ts`
- Baseline evidence: blob `f392127294b1bc12eb623111c6ed6e201fa1c385`; 1212 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1996 `libs/summary/ports/reader-summary-v3-preflight.port.ts`
- Baseline evidence: blob `0ed026e09bdf75cc8fd5b431e9f22f97fc2ea8dc`; 999 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1997 `libs/summary/ports/reader-summary-v3-preparation-source.port.ts`
- Baseline evidence: blob `d2e2c24ee30234ced4c53686da48200566fd0571`; 1559 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1998 `libs/summary/ports/reader-summary-v3-promotion.port.ts`
- Baseline evidence: blob `baf72ec9384e66f105799db05a655e2961caea98`; 1073 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 1999 `libs/summary/ports/reader-summary-weekly-certification-seal-authority.port.ts`
- Baseline evidence: blob `db4f7be0d37a7cd0c9dede3f89638389f9b9ef3a`; 1049 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2000 `libs/summary/ports/reader-summary-weekly-model-contract.ts`
- Baseline evidence: blob `39be99bd1ffc7e26d8b453e636850f999141c42f`; 5469 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2001 `libs/summary/ports/reader-summary-weekly-model.port.ts`
- Baseline evidence: blob `abf174822bab422b028fff136ce188b98df13c07`; 22105 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2002 `libs/summary/ports/reader-summary-weekly-projection-reader.port.ts`
- Baseline evidence: blob `6cc56347bb9700a29e9be009b5bd70cc53ee35d1`; 988 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2003 `libs/summary/ports/reader-summary-weekly-review-manifest.port.ts`
- Baseline evidence: blob `738d1b3ce969b1f1a0ae20aa44008ba721a701c8`; 1798 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2004 `libs/summary/ports/reader-summary-weekly-story-authority.port.ts`
- Baseline evidence: blob `f99244c45adcf452c0d97423154941b9e9b36d6d`; 840 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2005 `libs/summary/ports/story-ranking-metrics.port.ts`
- Baseline evidence: blob `60368a322b1724ec235d677592ccb62c38fe9578`; 1896 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2006 `libs/summary/ports/summary-artifact-repository.port.ts`
- Baseline evidence: blob `52baf28d6d252861b411a4561b6e999f432e6791`; 770 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2007 `libs/summary/ports/summary-event-publisher.port.ts`
- Baseline evidence: blob `697f9bbd5ee173c051720f8955c48c56fa67997d`; 199 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2008 `libs/summary/ports/summary-evidence-selector.port.ts`
- Baseline evidence: blob `c5f174c8987a44ea112da886034c1310e0a43507`; 2345 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2009 `libs/summary/ports/summary-feedback-repository.port.ts`
- Baseline evidence: blob `5b2de1f39287445286fbbdbefd7104da0916f3fc`; 1345 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2010 `libs/summary/ports/summary-freshness.port.ts`
- Baseline evidence: blob `1ec11bfca22a0c3af124d47d3dfb364ddb429ec1`; 734 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2011 `libs/summary/ports/summary-job-queue.port.ts`
- Baseline evidence: blob `b0f043abaae6285dc7042923a4e92f252670264b`; 457 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2012 `libs/summary/ports/summary-job-repository.port.ts`
- Baseline evidence: blob `74e19463a0adc551a64d0cebdc32c5e2e06303ae`; 632 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2013 `libs/summary/ports/summary-memory.port.ts`
- Baseline evidence: blob `ecb816d2763bb62f03a1de106521ab9196645da5`; 3894 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2014 `libs/summary/ports/summary-model.port.ts`
- Baseline evidence: blob `03a17875b04cc2cf1fa070aa84d53f4fac23ac1b`; 2742 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2015 `libs/summary/ports/summary-policy-repository.port.ts`
- Baseline evidence: blob `ea68ea16ee18aaee9ce9e74e3641e6f8b5911c2b`; 463 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2016 `libs/summary/ports/summary-quota.port.ts`
- Baseline evidence: blob `c02786e9eefc876f1cca67ea157afadb4b99b8fa`; 667 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2017 `libs/summary/ports/user-summary-preference-reader.port.ts`
- Baseline evidence: blob `843577c997afab7f257ca9b35f695c0b034d8d5b`; 1139 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2018 `libs/summary/ports/youtube-video-summary-provider.port.ts`
- Baseline evidence: blob `27c5e973f3b6be134166c0e449e128904201b847`; 1403 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2019 `libs/summary/test-fixtures/accepted-reader-headline.ts`
- Baseline evidence: blob `b4d4f7d5af4f3158b59525c8a656a1feb93814f3`; 1785 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2020 `libs/summary/test-fixtures/aug-14-related-topic.fixture.ts`
- Baseline evidence: blob `f31b51387fe8224c6d03189f54d8edac851a3c87`; 4742 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2021 `libs/summary/test-fixtures/configured-promotion-interests.spec-support.ts`
- Baseline evidence: blob `696f78dd45032058cefb445ab47d0d5ca19f06b0`; 732 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2022 `libs/summary/test-fixtures/execute-reader-summary-job-promotion-fixtures.ts`
- Baseline evidence: blob `cbd2bdcd3ab1e68603195ecd401badf385f99edc`; 8426 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2023 `libs/summary/test-fixtures/reader-summary-authoritative-provider-metadata.fixture.ts`
- Baseline evidence: blob `dfbbec0688ba423ca40e5877f96adb9813026b28`; 652 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2024 `libs/summary/test-fixtures/reader-summary-v2-daily-publication.fixture.ts`
- Baseline evidence: blob `53fe967db62ad4584a6dbb9d3b42e2066b938979`; 4196 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2025 `libs/summary/test-fixtures/synthetic-publication-assessment.spec-support.ts`
- Baseline evidence: blob `6b96305637fff5681333d3f59d4b37849563b1b7`; 3175 bytes; exact repository path.
- Owner classification: `libs/summary`; tentative role: other/legacy; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: owner-specific tests and actual changed behavior E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2026 `libs/usage/adapters/audit/in-memory-public-api-audit-log.ts`
- Baseline evidence: blob `16fff46e32a5d998d8ad3cb1e2c42b852ade6d5d`; 2288 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2027 `libs/usage/adapters/persistence/prisma/prisma-public-api-audit-log.ts`
- Baseline evidence: blob `015907bcb5f04f7f40ef16845b0eda65d83ffbf3`; 2589 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2028 `libs/usage/adapters/persistence/prisma/prisma-rate-limit-counter.ts`
- Baseline evidence: blob `011b51e0cda5b69f56104309c2d4b72e083a1164`; 1216 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2029 `libs/usage/adapters/persistence/prisma/prisma-usage-client.ts`
- Baseline evidence: blob `a967f62206c60a11577e37c7fa17797579a33e72`; 3853 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2030 `libs/usage/adapters/persistence/prisma/prisma-usage-connection.ts`
- Baseline evidence: blob `3497052e6d641b90796261a2dd24405a4c990c69`; 2097 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2031 `libs/usage/adapters/persistence/prisma/prisma-usage-quota-ledger.ts`
- Baseline evidence: blob `042c30479562866e6a68aa4d491bb6d363f9d91b`; 2232 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2032 `libs/usage/adapters/persistence/prisma/prisma-usage-records.ts`
- Baseline evidence: blob `05aebc63ce9651ef6cc783e73c62218276b83129`; 2601 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2033 `libs/usage/adapters/quota/in-memory-usage-quota-ledger.ts`
- Baseline evidence: blob `c8dea4da75a9ebb04b6a0f3f11b02cbbade5209e`; 1514 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2034 `libs/usage/adapters/rate-limit/in-memory-rate-limit-counter.ts`
- Baseline evidence: blob `a9c91cd1150df3f232d5d4efdb8afc7d0b242f6f`; 1152 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: outbound integration; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: adapter parity, failure/timeout and persistence E2E; architecture/typecheck/source-cap and final-HEAD native gates.
### 2035 `libs/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.command.ts`
- Baseline evidence: blob `4c3dd4a0bcec87d7d3bbbcd5d3ff086b55f68d8a`; 171 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2036 `libs/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.result.ts`
- Baseline evidence: blob `c80cc03fe3caf423a5d9b8619d81ce32a52b22fc`; 159 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2037 `libs/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case.ts`
- Baseline evidence: blob `8c4a0e58c0c9fdd114bdb787c3adb4fd471c56d8`; 2531 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2038 `libs/usage/features/list-public-api-audit-events/list-public-api-audit-events.query.ts`
- Baseline evidence: blob `52060b0788c299a7ec47fa73188334b7d22f8f04`; 522 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2039 `libs/usage/features/list-public-api-audit-events/list-public-api-audit-events.result.ts`
- Baseline evidence: blob `0b3eb7d33987373549d60b051c50a38eaa8bf389`; 228 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2040 `libs/usage/features/list-public-api-audit-events/list-public-api-audit-events.use-case.ts`
- Baseline evidence: blob `8f307a49810a71784be583ff1f78af7e793e756e`; 2473 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2041 `libs/usage/features/record-public-api-audit-event/record-public-api-audit-event.command.ts`
- Baseline evidence: blob `1cee4b592d417fccf67d299d33d66416bdbf0964`; 629 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2042 `libs/usage/features/record-public-api-audit-event/record-public-api-audit-event.result.ts`
- Baseline evidence: blob `1305766198c5e89e31b082ac54603c9c7991652a`; 115 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2043 `libs/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case.ts`
- Baseline evidence: blob `d7f5e0d63084228fd7ef1723ae2a6894be6e55ff`; 2030 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2044 `libs/usage/features/reserve-usage-quota/reserve-usage-quota.command.ts`
- Baseline evidence: blob `16ac7bc5257d08e5d64c3f8960eede869607dd6c`; 344 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2045 `libs/usage/features/reserve-usage-quota/reserve-usage-quota.result.ts`
- Baseline evidence: blob `db9a934ae88026b7f77773dfdf8311241f2deeef`; 216 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2046 `libs/usage/features/reserve-usage-quota/reserve-usage-quota.use-case.ts`
- Baseline evidence: blob `1fb6d7f6639f38306a5e9e6bbe8c3e65c28d068f`; 2925 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2047 `libs/usage/features/shared/public-api-audit-presenter.ts`
- Baseline evidence: blob `965ed2208e6583152de33fd1e0b55b7c43ac891f`; 349 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: feature/use-case; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: focused use-case, tenant/workspace and retry tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2048 `libs/usage/interfaces/rest/public-api-audit-events.controller.ts`
- Baseline evidence: blob `9937a8842bd70a8afae4a982c3d6ef9e84568726`; 6291 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2049 `libs/usage/interfaces/rest/public-api-audit-events.dto.ts`
- Baseline evidence: blob `b45ce4c27ed556ddd9507df67cc6741fe2b01a46`; 218 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2050 `libs/usage/interfaces/rest/usage-provider-tokens.ts`
- Baseline evidence: blob `27382191874cacaca720d98ddc5d89f1be54d675`; 1716 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2051 `libs/usage/interfaces/rest/usage-rest.module.ts`
- Baseline evidence: blob `99952439681b0abcfb74c3f825931dbc51d0ec1f`; 5594 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: inbound transport; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: HTTP/events/auth/wire contract tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2052 `libs/usage/ports/index.ts`
- Baseline evidence: blob `c56b7a72e84c670f075f4ed407d0fcdf7a288e22`; 131 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2053 `libs/usage/ports/public-api-audit-log.port.ts`
- Baseline evidence: blob `454b68ecd052a6f0a8ae05c38faf60cc4977bd8a`; 1488 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2054 `libs/usage/ports/rate-limit-counter.port.ts`
- Baseline evidence: blob `0df32f5f0aa752c09adcd8bd2279fa696120aa92`; 366 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
### 2055 `libs/usage/ports/usage-quota-ledger.port.ts`
- Baseline evidence: blob `8de7065b15c5af0b47dc67bb2a082f7eff21ac54`; 623 bytes; exact repository path.
- Owner classification: `libs/usage`; tentative role: application contract; confirm with source before refactor.
- Change admission: NO EDIT in Stage A; later edits need specific owned defect and separate scoped PR. No inferred refactoring mandate from size or folder name.
- Required evidence before behavioral edit: typecheck and fake/durable substitution tests; architecture/typecheck/source-cap and final-HEAD native gates.
