# E2 detached proposed graph compiler

This checkpoint integrates offline planning on main `8df17ed6eb2a6bc72e25cd1c0f40bbb6083dcc4c`.
The input `base` remains the reviewed E1 semantic-profile token `429e0f229c50f596d708216708775456b788251b`;
it is not a claim that unreleased ancestry is installed on main.
It adds no runtime registration, grant, RPC, admission, provider configuration, schema3 release or database behavior.
The E2 source/test files implement the detached graph contract. Existing main parser, runtime query compiler,
pass planner and E1 coordinator/scoring/cache remain byte-identical. B1 normalizer and v1/v2 wire suites are absent
on this main baseline and are not verification claims of this integration.

`PureCanonicalPlanCompiler.compile(input, sdkExpansion)` is synchronous. Its inner contract is
`x-canonical-plan.contracts.ts`; inputs and expansion are detached and deeply frozen before compilation.
The offline caller supplies the hash service and independently byte-verified source manifest. Source hashes are
not authority. The source-qualified expansion must be prepared with `compile_expansion` and `PinnedSdkBuilders`,
then serialized as JSON before crossing the TS seam. TS never starts Python outside tests.
The outer caller must also supply `verifiedSdkExpansionHashes` from successful executions of that pinned seam,
independently of the input's `sdkExpansionHash`. The compiler snapshots this capability list. Rehashing a forged
normalized-model hash, raw query or compact parameter string cannot qualify a replacement expansion. This trust
boundary reuses the actual SDK builders; it does not duplicate their query compiler in TypeScript. Neither this
preparation evidence nor any resulting hash grants runtime authority.

Required inputs include explicit command/ScanPlan, scope, entrypoint, config precedence, planner branch/recorded
compilation, seven immutable UTC day windows/clocks, exact proposed cap and amendment identity, retained inventory,
predecessor/sibling hashes, public effective operation manifest/profile and evidence provenance. Missing actual
deployment inputs return typed failures. Current interest rows cannot substitute for a ScanPlan. `DEPLOYMENT`
requires frozen evidence; switching a synthetic fixture's evidence-mode field fails.

Every output remains `kind=x-canonical-graph-plan`, `planningVersion=1`, `releaseState=PROPOSED`,
`productionGraphFrozen=false`. E3 capture, E4 admission, native model parity and send amendment remain unresolved.
The complete detached input snapshot is retained alongside its semantic hash. Optional request scalar values use
explicit null; config absence and cursor presence/hash remain distinct in that snapshot. Cursor plaintext is not
needed for planning: the pinned E1 branch ignores incoming cursors and returns no external next cursor.
The Python graph request therefore requires `cursor=null`; incoming cursor presence/hash belongs only in the TS
ScanPlan snapshot. Direct SDK builder parity tests separately exercise cursor insertion. Python detaches closed
JSON inputs before invoking builders, so caller mutations cannot alter the proposal being compiled.

The unchanged binding builder and query compiler resolve the primary; the unchanged parser resolves lanes.
The wrapper detects default8 truncation, nested cap shadowing and configured/local overflow beyond16. Exact10/11
are proposals, not stored-binding migrations. Default plan.maxItems25 stays separate from the acceptance target100.
Per-query budgets, ranking absence of generatedAt, adaptive targets and B1's minRetweets-to-minReposts mapping are
preserved by the extracted pure predicate policy. No B1 normalizer is imported. Retrieval thresholds and split raw queries are separate from final predicates.

The Python seam verifies the fixed manifest hash and all30 original SDK file hashes before extracting allowlisted
pure functions. It never imports Scweet, Pydantic, Runner, client, auth, accounts or transport. The inert scalar
request provides builder inputs, not SDK model validation. The unchanged repository date-window function is extracted
after its source pin check; the unchanged pass planner executes normally. Runner date normalization and global stop
are source-oracle assertions only. Dynamic model parity remains a parent native task.

The pinned daily interval ends at 23:59:59. Five fixture splits end at 04:47:59, 09:35:59, 14:23:59, 19:11:59,
23:59:59; short windows can yield fewer splits. Compact GraphQL parameter strings preserve SDK escaping and ordering.
The operation manifest is separate from the installed-source manifest. Both public operation and profile hashes
are recomputed; runner-derived page-size hints must resolve to20 for this proposed incident profile.
The incident TS profile rejects explicit lang/since/until/min/filter operators that suppress generated constraints;
the pure SDK seam retains their exact source semantics and tests them independently, without rewriting queries.

K counts planned supplementary descriptors; R counts supplied retained descriptors. Per-day maximum is
`6 + 5*(K+R)`, summed across seven days with safe-integer checks. Page limit5, bootstrap6, redirects<=2,
request10000ms, candidate800/day and5600/total, time600000ms/day and4200000ms/total are proposed maxima.
There is no minimum-send bound. Each pass has its own SDK global stopper, which may leave later split tasks
unattempted. A needed sixth page means incomplete containment; ordinary global-stop closure does not require
exhausting all descriptors. Later cursor parameters require observed predecessor evidence and are never fabricated here.

Semantic hashing uses the exact reviewed pure `xSemanticDigest`, extracted into `x-canonical-digest.ts`; fractional adaptive ratios use canonical finite decimal strings,
rehydrated before invoking the unchanged reader. Python uses matching safe-integer and UTF-16 key-order semantics.
Source and report artifact hashes are SHA256 over original bytes, not wire/admission hashes.

The focused TS fixture suite invokes the actual Python expansion and then compiles complete seven-day synthetic
graphs for10 and11 lanes. These yield150/165 descriptors per day and5292/5817 proposed total sends with R0.
They prove pure fixture compilation only. Production graph freezing, target100 delivery and global seven-day E2E
remain unclaimed. Missing historical command, effective deployment manifest and amendment authority are not manufactured.

Run focused tests with the existing project toolchain (no additional dependencies):

```sh
E2_ARTIFACT_DIRECTORY=.cache/handoff node_modules/.bin/jest --cacheDirectory .cache/e2-jest --runInBand libs/ingestion/infrastructure/x-observation/x-canonical-plan-compiler.spec.ts libs/ingestion/domain/x-observation/x-canonical-graph-policy.spec.ts libs/ingestion/infrastructure/x-observation/x-canonical-pure-parity.spec.ts
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=apps/x-collector/src:apps/x-collector/tests python3 -S -m unittest discover -s apps/x-collector/tests -p test_canonical_graph_compiler.py
npm run check:architecture
npm run check:code-quality
npm run check:source-line-cap
```

Python test support automatically verifies the source-owned plaintext SDK evidence in `test/fixtures/x-canonical/`
and materializes its exact manifest and all30 SDK files in a fresh process-owned temporary directory.
The 30 `.py.txt` files retain exact reviewed bytes; the manifest and inert command retain their fixed seals.
The exact file/directory closure and symlink refusal are checked before materialization.
Manifest and all member hashes are checked before writing; the unchanged SDK seam verifies them again
before pure AST extraction. Temporary directories are cleaned up at process exit. There is no network,
installation, Git-history or ignored-fixture dependency. Missing or corrupt source inputs fail; no skip
or fallback is available. Ordinary Jest execution invokes this bootstrap through the existing Python
fixture support. Expanded JSON outputs remain optional ignored evidence, not qualification inputs.

Main integration owns the original eleven E2 files and five bounded helper/spec additions. Query budget/target,
descriptor-safe predicate snapshot with `policyRecord`, and fixed UTC coordinates live in domain; SHA256 lives in
infrastructure. Structural budget inputs avoid importing adapter configuration types into domain. Function declaration
bytes, including arithmetic, descriptor handling, error strings and canonical JSON edge behavior, match reviewed
`b8ad9fa535dea1b28de0478162b8cc0aeee347be`. No grant, receipt admission, acquisition, selection/ranking or wire module
is introduced. Both compiler-required pins and fixture pins name all four extracted helper files.

The pure parity spec reads the four full reviewed source blobs from `test/fixtures/x-canonical/`,
using `.ts.txt` to mark immutable evidence rather than importable TypeScript modules. Their pinned
SHA256 values are checked before AST extraction; only explicitly named pure declarations execute,
with crypto supplied directly. Production never reads or executes these fixtures. Source provenance,
byte/line inventory and license information live beside the fixture inputs.
The spec compares exact declarations and exercises numeric edges, missing budgets, descriptor attacks, freezing,
Unicode, sparse arrays and canonical JSON rejection behavior. It intentionally preserves legacy JSON getter
semantics; descriptor-safe input snapshotting remains the separate validation boundary.

The ownership gate hashes every one of the 6314 tracked main baseline files as Git blobs and verifies file modes,
including symlinks. Missing files, changed bytes or mode changes fail. A sealed UTF-8 JSON manifest supplies all6314 path/mode/kind/blob tuples from exact main `git ls-tree -rz`.
The spec pins both representation SHA256 and the exact reconstructed NUL-manifest SHA256 and byte count.
It runs in a source archive or depth-one checkout without a baseline Git object. Updating HEAD cannot
replace that baseline. The fixture is mechanically generated evidence; it does not change the ownership scope.
The complete ten/eleven-lane fixture test additionally compares all 2205 descriptor normalized request hashes,
raw queries, compact GraphQL parameters and their hashes against the pinned actual adapter/SDK pure builders.
This remains source-level semantic parity, not native SDK model validation or runtime dispatch evidence.
