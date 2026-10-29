# OpenAI Decisions reader-value provider: executable evidence

Date: 2026-10-29. Implementation branch: `feat/openai-decisions-reader-value`.
Plan and review scope: [approved provider plan](../plans/2026-10-29-openai-decisions-provider.md).

## Result

The controlled live application pipeline passed with two successful OpenAI Decisions requests. The actual stored answers admitted one synthetic source and excluded the other. Both sources completed through the production input builder, durable preparation and pinning, batch-owned claim/dispatch authorization, real Decisions adapter, production Prisma completion, fresh-adapter exact reuse, candidate qualification and pinned manifest reference reads. The complete second pass sent zero additional provider requests.

The deterministic pipeline also passed for both OpenRouter SystemOne/Jev and OpenAI Decisions. A separate persisted-refusal scenario proved that a Decisions refusal becomes a terminal item failure and the same worker instance can assess subsequent work without pausing.

This evidence verifies the second scoring provider and downstream consumption in an isolated database. It does not certify comparative model quality, production throughput, the complete historical migration chain or final summary writing/presentation.

## Environment and limitations

- Local database: isolated PostgreSQL **17.10**, loopback port `55489`, guarded `assessment_test_admin` identity. Each fixture creates its own database and scoped runtime role and cleans them up afterward.
- Database execution used the production `PrismaReaderValueConnection`, inventory, assessment store and exact lookup. Current interest authority was read from the fixture database through the scoped Prisma connection.
- The existing fixture applies baseline schema, RLS helpers and the assessment migration. It is a **partial migration fixture**. These successful local runs are not a full migration-chain certification.
- The required PR job `reader_value_v3_postgres18` runs the deterministic provider command with the existing PostgreSQL **18.4** service. CI completion is a separate gate owned by the coordinating agent; this report records local results only.
- Runtime: Node **24.22.1**. This environment requires `NODE_USE_ENV_PROXY=1` for built-in `fetch` to use its configured HTTPS proxy. Its trusted CA configuration was retained. No production transport, proxy policy or TLS validation was changed for the sandbox.
- Only synthetic source content and interest configuration were used. Reports contain stable identities, hashes and safe accounting, not credentials or raw source/prompt/response/error bodies.

## Request accounting and transport diagnosis

| Run | Actual outcome | Attempts / successful responses | Input tokens | Output tokens |
| --- | --- | --- | ---: | ---: |
| Initial direct contract discovery | HTTP 200; one benign named two-option choice, string input | 1 / 1 | 128 | 0 |
| Initial application harness | Failed with stable `transport` failure before a usable response; no automatic retry | 1 / 0 | Unknown | Unknown |
| Corrected application harness | Passed with environment proxy enabled; production four-question `input_json` request for each of two sources | 2 / 2 | 2,373 | 0 |
| Fresh-adapter application reuse | Passed; all downstream rereads reused durable rows | 0 / 0 | 0 additional | 0 additional |

There were **three successful authenticated Decisions responses**, totaling **2,501 known input tokens** and **zero known output tokens**, plus the separately recorded failed application transport attempt with unknown usage. Unknown usage is not represented as zero. The direct contract probe is separate from application E2E evidence.

The application harness has one shared four-call ceiling across source scenarios and adapter recreation, with the counter reserved before each transport call. The corrected run used **two calls**, blocked **zero**, and performed no worker or adapter retry. The initial failed application attempt and corrected run together account for three application transport attempts; the corrected rerun was explicitly authorized after diagnosis.

Diagnosis used two unauthenticated `GET /v1/models` checks: the default Node environment failed transport, and the same check with `NODE_USE_ENV_PROXY=1` returned the expected **401**. These checks used no credential and performed no paid scoring. The existing successful Python contract probe had already established endpoint/key access. There were no further paid calls after the successful corrected application run.

## Actual persisted live results

Both assessed rows used the same selected configuration:

- Scoring provider selector: `openai-decisions`.
- Requested and returned model: `gpt-6-luna`.
- Persisted adapter identity: `OpenAI`.
- Model configuration: `openai-decisions.gpt-6-luna.reader-value.v1`.
- Input builder: `reader-value-input.openai-decisions.v1`.
- State: `assessed`; attempts: `1`; authorized `sentAt`, completed `finishedAt` and active summary-job pin all present.
- Billed cost: **null**; `usageUnknown: true`, including after exact lookup and manifest reference reads. Token counts do not establish provider billing.

| Field | Source admitted by actual policy | Source excluded by actual policy |
| --- | --- | --- |
| Feed ID | `62fc2503-136a-452b-a9c7-06b87a05373f` | `b937f9f2-bda9-468d-9aec-5f85b1ab5b18` |
| Assessment ID | `8398e77d-fde9-4861-9461-0947b2da6220` | `95b11246-6b1f-441b-8e3b-05d1ba75aca4` |
| Summary job ID | `f27d11d1-2d45-43f7-86e3-84d8e773dac1` | `987ea8a7-c361-4561-b368-9f36b1661d20` |
| Provider request ID | `req_13146dcc51ad40449418af6fa2c1a74f` | `req_3fc8bbc75caa41fd8ddd2f3b6776a1af` |
| Persisted usefulness | `useful` | `noise` |
| Persisted relevance | `central` | `unrelated` |
| Qualification result | Admitted: 1; excluded: 0 | Admitted: 0; excluded: 1 |
| Input / output tokens | 1,205 / 0 | 1,168 / 0 |
| Adapter latency | 888 ms | 209 ms |
| Additional calls on second pass | 0 | 0 |

The live test did not assert these subjective labels in advance. It asserted that actual qualification equals the existing admission policy applied to the exact persisted answers: usefulness in `useful|important` and relevance in `relevant|central`.

| Immutable identity | Admitted source | Excluded source |
| --- | --- | --- |
| Input SHA-256 | `f2bf7ce7603f0c70ca2ae59bfbc6f8801afab8ad4f8ac8982794724acbac0f6c` | `45275106a069e36c0f1a1270704fced8ac7db18b44d354335210d150dd253136` |
| Exact request SHA-256 | `e1d8f4ad6c69adcd7444d402faf5686ed44e0f135cf5735d65b8c96e1a4dd922` | `318fc69edbab614276118621f01092a3d9d17a32d998f3a8873373861e960f50` |
| Source snapshot SHA-256 | `ff5bbf494aa0fca843031889e4d35973ade2b0127f1f8fa40582dd250c8c7d74` | `75402f18ce7ca853ab71ae32001f9c84168fe24c841332c02e41b707da5765a3` |
| Pinned manifest SHA-256 | `5c1568ea2230af70710e3b6de2c11be039876b8a9e84954f18e73b96f0f4a3f8` | `26c9ee88f7390a83b423a70456d950400fa2831d25f46b24be4e1f3daf44ded6` |

For each source, fresh discovery reported an assessed cache hit; a fresh batch dispatched nothing; fresh preparation reproduced the identical manifest/hash and assessment ID; pinned reference reads returned the same assessed answers; and the actual qualification audit bound the same assessment, input, interest and source snapshot. Preparing the same source through Jev produced different request/input/config identities, could not find the Decisions row through exact lookup, and created a separate pending row without another transport call. A mismatched frozen preparation configuration returned `config_unavailable`.

## Deterministic and focused regression results

`check:reader-value-provider-pipeline-postgres` passed twice, including the final safe-failure-reporting revision:

- Jev and Decisions each completed one synthetic transport attempt through the production adapters and durable pipeline. Both admitted the deterministic useful/relevant source.
- Both reproduced the same manifest after adapter recreation and sent zero calls during discovery, batch execution, preparation, reference reads and qualification reuse.
- Decisions persisted null billed cost and unknown usage; Jev retained its supplied billed-cost semantics.
- Both proved provider-specific cache separation and frozen configuration mismatch rejection.
- The refusal fixture persisted `permanent_failed` with `provider_refused`, null answers/cost and unknown usage. The same batch instance then persisted an `assessed` item. It stayed unpaused, spent exactly two synthetic calls and did not retry the refused item.

Focused Jest validation passed: **2 suites, 11 tests** across the worker dispatch spec and transport-ceiling spec. The ceiling test made concurrent synthetic attempts and proved that a shared budget of four forwards only four calls and blocks subsequent attempts. The worker spec proves refusal completion and continued dispatch while retaining the existing lost-acknowledgement, persistence retry and fatal-pause tests.

The core implementation owner separately reported a final targeted pass of **4 suites, 132 tests** for the Decisions scorer/parser, shared builder, existing Jev scorer and domain answer validator. Broader repository and CI gates are recorded separately by the coordinating agent.

## Reproduction

Install the repository's pinned dependencies and generate its Prisma client using the existing setup. Supply an isolated localhost database URL with the `assessment_test_admin` identity in `READER_VALUE_TEST_ADMIN_DATABASE_URL`. The fixture rejects remote hosts and other administrative identities. Keep database URLs and credentials out of logs.

Deterministic production-pipeline check; it requires no external API credential:

```sh
READER_VALUE_TEST_ADMIN_DATABASE_URL='<isolated local assessment_test_admin URL>' \
  npm run check:reader-value-provider-pipeline-postgres
```

Focused regression tests:

```sh
npx jest --config jest.config.ts --runInBand --runTestsByPath \
  scripts/lib/reader-value-provider-pipeline-fixture.spec.ts \
  libs/relevance/application/use-cases/assess-reader-value-batch.use-case.spec.ts
```

Explicitly authorized live application check, with a short-lived credential injected into the process environment. The credential shown below is a placeholder. `NODE_USE_ENV_PROXY=1` is required by the environment used for this report; it is not a production adapter requirement.

```sh
NODE_USE_ENV_PROXY=1 \
READER_VALUE_OPENAI_DECISIONS_LIVE=true \
READER_VALUE_TEST_ADMIN_DATABASE_URL='<isolated local assessment_test_admin URL>' \
OPENAI_API_KEY='...' \
  npm run check:reader-value-openai-decisions-live-postgres
```

The live command normally sends two paid requests and always limits forwarded transport calls to four. It does not automatically rerun after failure. Its JSON output contains safe execution identities, actual persisted choices, admitted/excluded IDs, accounting and the reuse-call delta. It explicitly reports `finalSummaryWritingVerified: false`.

## Acceptance review and remaining gates

The implementation was published at `f284dcaa3bae680647f42376c6d9bbe92386781d` in [PR #583](https://github.com/777genius/social-monitor/pull/583). Both independent plan-review rounds completed before implementation. Final independent critics `final_core_critic`, `final_integration_critic` and `final_e2e_critic` all approved with no P0–P2 findings. The E2E critic independently reran the two focused worker/transport-ceiling suites: **11 tests passed**.

| Acceptance evidence | Result |
| --- | --- |
| Production build of the published implementation | Passed |
| Architecture, code quality, source line cap, runtime guards, source certification and scoped lint | Passed |
| Existing assessment PostgreSQL regression gate on local PostgreSQL 17.10 | Passed |
| Both deterministic provider pipelines; refusal continuation; bounded live Decisions application pipeline and exact reuse | Passed, with the scope and request accounting above |
| Existing V3 publication PostgreSQL gate | Stopped locally at its existing PostgreSQL 18 `psql` transport precondition; no requirement weakened |
| Required PostgreSQL 18 PR job | Initial run passed deterministic assertions, then exposed the fixture teardown race described below. The fixture-only correction passed focused rereview and four sequential local database gates; authoritative CI rerun pending |
| Security placeholder correction | Full tracked-file secret scan, including this report, passed with 29 scanner tests. The canonical-placeholder correction also passed 70 Decisions scorer tests, the exact 56-test deployment-sharding suite and scoped lint |
| Other required CI checks | Pending completion |

The final reviews accept the requested second scoring provider and its controlled downstream pipeline. A separate focused review of the subsequent fixture cleanup correction found no blocker. These results do not convert the local PostgreSQL 17 fixture into PostgreSQL 18 publication-gate evidence or establish live final-summary writing. The coordinating agent must publish the final corrections and resolve the authoritative CI rerun before merge; this report does not claim that merge is complete.

### Fixture cleanup correction after initial CI

The first PostgreSQL 18 CI run completed the new deterministic assertions but failed during database teardown with `57P01`. Installed `pg-pool` can resolve `Pool.end()` after removing clients from its count but before their asynchronous physical disconnect callbacks finish. The fixture's forced database drop could then terminate a still-ending Prisma runtime socket and emit an uncaught idle-client error. The new harness had also printed success before awaiting cleanup.

The correction is restricted to test fixture and harness lifecycle code. It releases the production Prisma lease, reuses the existing reviewed removal-acknowledgement helper for the fixture-owned pools, performs strict `DROP DATABASE` without `FORCE`, removes only roles created by the fixture, and closes the admin pool. A genuine remaining backend or unexpected cleanup error still fails the gate. Both new harness entrypoints print success only after awaited cleanup. No production connection, scoring request, retry policy or TLS behavior changed.

The new cleanup regression uses the installed `pg-pool` with deliberately delayed wire-disconnect acknowledgements. It proves destructive DDL and success remain blocked until owned clients are physically removed, and that a strict-drop failure propagates while the admin pool closes. Together with the existing reviewed cleanup suite, **2 suites / 10 tests passed**, including an independent rerun. The existing assessment and new provider PostgreSQL commands then ran twice sequentially on local PostgreSQL 17.10: **four child processes exited zero after cleanup**, without `57P01`. No additional paid calls were needed. The PostgreSQL 18 CI rerun remains the authoritative follow-up gate.
