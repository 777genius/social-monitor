# Backend SDK and runtime qualification

Status: implementation and qualification in progress. This is a separate dependency/runtime slice after domain-boundary PRs #790, #791 and #792. It does not reopen their source changes.

## Problem and ownership

Social Monitor vendors a digest-pinned private Account Gateway SDK. Its declared runtime, and the existing Get Modular 0.2 dependencies, already require supported Node 24/26 versions; the application image and backend CI still select Node 22. The requested stable Get Modular 0.8 pair removes the old Assembly factory API. Updating consumer overrides without migrating the producing SDK would break its optional composition entry.

Account Gateway PR123 owns the narrow producer migration to immutable module entries, all four coordinated Core/Assembly 0.8.0 pins, the generated pnpm lockfile, and its existing development-only Foundation 3.0.0 to 3.1.0 update. Social Monitor has no Foundation dependency to bump; adding a new checker or replacing the existing architecture gate is outside this dependency refresh.

## Consumer scope

1. Qualify the existing backend on supported Node 24.22.3. Limit the consumer root engine contract and host artifact admission to `>=24.21.0 <25`; align canonical backend CI pins, application Docker bases, immutable candidate context/digest, and their existing executable contracts.
2. Remove only the unsupported `--experimental-default-type=module` option from the architecture command and two typed-test launchers. Keep the required TypeScript transformation flags and CommonJS application semantics. The later [native toolchain decision](2026-11-27-typescript7-native-toolchain.md) assigns build and typecheck to native TypeScript 7.0.2 and retains TypeScript 6.0.3 only as the underlying JavaScript Compiler API compatibility implementation.
3. Preserve independent frontend and release-controller toolchains that do not install or execute this backend dependency graph. Do not blanket-rewrite historical fixtures or alter any workflow's enabled/disabled state.
4. Keep the private host artifact's supported runtime and vendored dependency closure accurate. Its current packaging omits the nested Account Gateway archive; cover the complete required file-dependency closure with the existing isolated archive test.
5. After upstream source review and qualification, build the real SDK package twice and verify identical hashes. Preserve its public HTTP/contracts and merged experimental LLM entry; inspect the exact producer delta and qualify the existing downstream adapter fixtures.
6. Replace the vendored SDK archive and provenance with the actual reviewed source SHA/tree/PR and archive byte length, SHA-256 and integrity. Generate the npm lockfile with the package manager. Do not hand-edit integrity, forge provenance or use a broad dependency override.
7. Keep all existing tenant, authority, idempotency, lease, retry, cancellation and publication rules. No new provider/account selection, LLM retry, routing, schema or business policy belongs here.

## Compatibility boundaries

The consumer uses native TypeScript 7.0.2 for build/typecheck and retains the JavaScript Compiler API for NestJS, ts-jest, ts-node, typed ESLint and AST tools through the explicitly locked compatibility package (`@typescript/typescript6@6.0.2`, backed by `@typescript/old@6.0.3`). Consuming compatible SDK declarations does not require migrating those embedded APIs. Full native compiler/parser parity remains separate future tooling work, not a result claimed by this transition.

Account Gateway independently supports Node 24 and 26. Social Monitor qualifies only the Node 24 line in this slice: an actual Node 26.11.1 probe rejects `--experimental-transform-types` with exit 9, while the existing architecture fixtures still require that option. Advertising Node 26 for the consumer would therefore promise an unsupported toolchain. Preserve the transformation flags and historical Node 26 archive reproductions; broader consumer runtime support requires separate qualification.

The producer's current main contains the original LLM feature. Its reviewed delta includes correct handling of a completed event whose nested response status is incomplete; the new artifact must pass the downstream error/identity fixtures. Do not describe the entire refreshed SDK as byte-identical to the older archive.

The canonical immutable candidate remains pinned to an independently retrieved official image digest. Updating a Docker tag without updating the candidate build-context mapping and exact guard would silently lose that pin, and is prohibited.

## SDK identity and retained evidence

The new archive is built from reviewed Account Gateway source `c610c95acfdadab1e2feeaef7af2d9881bb4a48c`, tree `a602f855d4ee93b4707bb406eeaab7f0fe2bd560`. Its current execution identity is `0.1.0-gm08.c610c95` with archive SHA-256 `2d7861f4f88cc34b7461228e190122a3e946d3ad7986ee1c18dfcc403444e8a7`. Keep the older archive and provenance as historical evidence; new execution, health checks and fresh manifests use the current pair exclusively.

Source review found that persisted weekly attestations and retained artifact readers also bind the previous SDK pair. This justifies one narrow additive SQL migration alongside the dependency refresh: replace the latest weekly attestation validator with the same function admitting either complete known version/digest pair. SQL continues admitting old writes and replays; the upgraded application emits only the new pair. Keep ownership, grants, transaction isolation, JSON shapes, request/output binding and model policies unchanged. Do not edit historical migrations, stored attestations, canonical hashes, manifests or other data rows.

Retained weekly proofs and refresh reconciliation/successor originals may recognize the current or historical complete pair. Evaluation receipt binding may recognize either pair only after exact current-source, fixture and request manifest validation; pre-update source manifests remain historical evidence and cannot be imported as current results. The independently supplied live receipt file hash remains mandatory. Crossed version/digest pairs remain invalid, and fresh execution remains current-only. This provides additive database and forward-reader compatibility; it does not claim that an unmodified old application can consume new-identity evidence after rollback.

## Verification gates

- Exact locked install on the supported runtime, generated Prisma client, semantic typecheck and backend build.
- Native gRPC generator/contract verification; no manually edited generated files.
- Full architecture, source cap, quality, review-CI, candidate workflow/container and existing lifecycle contracts.
- Existing SDK/LLM adapter, schema, output violation and promotion presentation tests.
- Full deterministic API/worker E2E, followed by all protected final-head native unit shards, PostgreSQL 18, RabbitMQ, security, candidate/lifecycle and frontend checks.
- Real offline candidate build/runtime proof, including the selected Node version and immutable image/source binding.
- Independent source and scope review; preserve open refactor PR changes, especially shared package script registrations.
- Qualify consolidated PR #793 at its exact final head and obtain independent approval; #791 and #792 are superseded and must not merge separately. Apply the later native-build and compatibility-consumer qualification profile in the linked toolchain decision; full native compiler/parser parity remains unfulfilled and any broader owner HOLD requires explicit owner authorization to revise. Merge #793 only with expected-head protection and an ordinary merge commit to preserve #801 ancestry; inspect postmerge main native 20/20 and API image results. Queued, skipped or cancelled jobs are not PASS.

No real provider/account call, production database query, manual production activation or public npm publication is part of this implementation. Source and package qualification use isolated fixtures and disposable CI environments.
