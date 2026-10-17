# Native JEV primary V3 daily summary cutoff fix

## Checkout and scope

- Enrolled base verified before editing: `9fd120f805b7b196206d73d6b78f0e89fa7996b2`.
- Production source change: `scripts/capture-durable-reader-summary-from-postgres.ts`.
- Regression test added: `scripts/lib/reader-summary-native-v3-cutoff.test.mjs`.
- No pure command seam was added because the capture entrypoint has top-level execution side effects (`scripts/capture-durable-reader-summary-from-postgres.ts:985-989`) and the call-site contract can be tested directly and statically without introducing a production helper.

## Root cause recap

The native branch built a new command object with an explicit live cutoff at `scripts/capture-durable-reader-summary-from-postgres.ts:530-534` (pre-fix: `command: { ...command, observedThrough: liveObservationCutoff }`). The shared command itself has only `tenantId`, `workspaceId`, `readerSummaryJobId`, and `maxEvidenceItems` (`scripts/capture-durable-reader-summary-from-postgres.ts:524-529`). `liveObservationCutoff` remains part of the shared `resolveProductionDayPromotionInput` wiring at `scripts/capture-durable-reader-summary-from-postgres.ts:215,222-231`; that computation was not changed.

`ExecuteReaderSummaryJobUseCase.execute` converts `command.observedThrough` to `explicitCutoffTime` (`libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case.ts:83-88`) and passes it to `resolveReaderSummaryAuthorityBoundary` (`:110-113`). For a `jev_primary_v3` job, `validateReaderSummaryExecutionCutoff` deliberately returns exactly:

`DomainError("operation.conflict", "Explicit live cutoff is unsupported on an authoritative refresh, V3 or recovery route")`

Evidence: `libs/summary/features/execute-reader-summary-job/execute-reader-summary-job-support.ts:41-52`. `resolveReaderSummaryExecutionObservedThrough` enters that guard whenever `cutoffTime !== undefined` (`:91-100`). The boundary therefore returned `err` before `prepareReaderSummaryV3Job` could freeze the V3 manifest (`execute-reader-summary-job.use-case.ts:111-117,128-137`). The capture script then threw the boundary error and exited nonzero (`scripts/capture-durable-reader-summary-from-postgres.ts:535-537`).

## Exact change

Only the native execution call changed. It now passes the existing `command` object unchanged:

```diff
        execute: new ExecuteReaderSummaryJobUseCase(...dependencies),
-       command: { ...command, observedThrough: liveObservationCutoff }, clock });
+       command, clock });
```

The legacy branch remains byte-identical at `scripts/capture-durable-reader-summary-from-postgres.ts:530-531`: `captureExecution.execute(dependencies, command)`. `validateReaderSummaryExecutionCutoff`, `resolveReaderSummaryExecutionObservedThrough`, `prepareReaderSummaryV3Job`, `nativeV3Owner`, `RequestReaderSummaryUseCase`, `summary-one-shot.mjs`, deployment files, and timers were not modified.

## Why the authoritative cutoff is preserved

1. With `cutoffTime === undefined`, `resolveReaderSummaryExecutionObservedThrough` skips `validateReaderSummaryExecutionCutoff` and calls `readerSummaryObservedThrough` (`execute-reader-summary-job-support.ts:91-103`). That resolver returns `undefined` immediately for keys without the `reader-summary-new-input-refresh` prefix (`:69-77`). Native jobs use `native-reader-summary-v3:<hex>` (`libs/summary/application/contracts/reader-summary-native-owner.ts:5,14-15`), so `resolveReaderSummaryAuthorityBoundary` resolves `ok({ firstPublicationBoundary: undefined, observed: undefined })` (`libs/summary/features/execute-reader-summary-job/reader-summary-first-publication-execution.ts:67-87`).
2. The V3 path then calls `prepareReaderSummaryV3Job` and assigns `observedThroughTime = new Date(frozenV3Manifest.cutoffAt).getTime()` (`execute-reader-summary-job.use-case.ts:128-137`). `runModelPipeline` accepts an undefined observed-through (`:173-177`). The later evidence/prepublication bind falls back to `clock.now()` only if `observedThroughTime` is still undefined (`:202-210`), which is not true after a V3 manifest has been frozen.
3. No authoritative time is lost. `nativeV3Owner` canonicalizes the supplied exact cutoff into `owner.cutoffAt` (`scripts/lib/reader-summary-native-v3-owner.ts:24-45`), and `RequestReaderSummaryUseCase` persists that owner value as `preparationCutoffAt` (`libs/summary/features/request-reader-summary/request-reader-summary.use-case.ts:248-258`). V3 preparation uses `snapshot.preparationCutoffAt` as its cutoff (`libs/summary/adapters/evidence/relevance-reader-summary-v3-preparation-source.ts:232-241`), while manifest freezing rejects any V2 manifest whose `cutoffAt` differs from the persisted `preparationCutoffAt` (`libs/summary/domain/entities/reader-summary-job.ts:201-216`). Thus the owner identity, persisted preparation cutoff, and frozen manifest cutoff are the same canonical daily microsecond instant. The removed override only removed a forbidden duplicate live representation of that authoritative instant.

## Regression proof

The focused Node test covers all required cases:

- Exact explicit-cutoff `DomainError` guard on `jev_primary_v3`.
- A native-owner command with no `observedThrough` property; both the direct resolver and authority boundary return undefined observed-through.
- Native call-site command shape contains `command, clock`, no `observedThrough`, and no reconstructed spread command.
- Legacy call remains exactly `captureExecution.execute(dependencies, command)` and the shared command literal is unchanged.

Before applying the source fix, `node --test scripts/lib/reader-summary-native-v3-cutoff.test.mjs` exited 1 with 2 passing and the native-wiring assertion failing (`before-test.log`). After the one-line fix, the same command exited 0 with 3 passing (`after-test.log`).

## Checks

- `node scripts/check-architecture.mjs`: pass (`check-architecture.log`).
- `node scripts/check-code-quality.mjs`: pass (`check-code-quality.log`).
- `node scripts/check-source-line-cap.mjs`: pass (`check-source-line-cap.log`).
- Required `npx tsc -p tsconfig.build.json --noEmit` could not start because this execution image exposes only `node`; `npm`, `npx`, and `tsc` are absent. `npm ci` failed at command lookup with exit 127 (`npm-ci.log`), and the required typecheck remains pending in `result.json`.
