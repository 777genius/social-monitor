# Bounded offline paired policy executor

This implements **conditional selection-policy comparison on frozen producer-validated
post-assessment evidence and grouping**. The full algorithm experiment remains
required and is not implemented or claimed here. No production/model/provider/DB
ports are constructed. There is no live fallback, publication, install, or runtime
launch. `complete` always remains false; `conditionalPolicyComplete` describes only
this narrower boundary. A conditional result says nothing about grouping accuracy,
model quality, generation, publication, or historical deployment identity.

Source execution uses Git object reads, without checkout/index/history changes.
Every relative import and alias resolves through the named revision's tree and
`tsconfig.json`, including barrels and transitive imports. The local TypeScript
compiler must match each revision's lock version; its actual file hash, Node
version, lock hash, tsconfig hash, tree and every loaded blob/hash are reported.
There are no external runtime dependencies except restricted `createHash` and
`util.types` builtins. The isolated VM denies other imports, process, network APIs,
timers and randomness, freezes Date, and bounds each module/call to ten seconds.
This is a trusted, pinned-source execution boundary, not a hostile-code sandbox.
Source loading is transpilation of the small dependency closure, not a full build.

All modifications belong to this directory. Git lock create/remove was attempted
at writer start and failed with EROFS; orchestration must apply/commit the delivered
patch outside this sandbox. Do not push or merge as part of these commands.

## Commands

Run from the repository with both named Git objects and existing local dependencies.
No archive, dependency install, environment secrets, or additional checkout is needed.
Outputs are create-only, mode 0600, and restricted to `/tmp`; use a new output path
for each run. Inventory and missing/invalid evidence exit **2**. Only a complete
conditional seven-day policy matrix exits **0**, still with `complete: false`.

```sh
node --test scripts/evals/reader-paired-experiment/adapter.test.cjs
node scripts/evals/reader-paired-experiment/run.cjs --mode inventory --out /tmp/reader-paired-inventory.json
```

Inventory includes all six refreshed raw files and the two pinned Sep2 captures,
actual raw hashes/counts/capture times, six missing originals, and missing assessments,
requests, headlines, grouping and controls for both arms of every day. It performs
raw structure/day checks; full joins and rehydration are checked before policy execution.
Its `pendingManifest` is a template, not a runnable claim of complete evidence.
Sep2 “original” means the supplied Sep8 capture, not publication-time input.

Once genuine producer records and all original inputs exist, save a completed
manifest as `/tmp/reader-paired/recorded-seven-days.json`, then run exactly:

```sh
manifest_sha=$(sha256sum /tmp/reader-paired/recorded-seven-days.json | cut -d ' ' -f 1)
node scripts/evals/reader-paired-experiment/run.cjs --mode policy --manifest /tmp/reader-paired/recorded-seven-days.json --sha256 "$manifest_sha" --out /tmp/reader-paired/conditional-seven-days.json
```

This single command runs two separate seven-day experiments: OLD versus FINAL on
identical current snapshots/projections/controls, and FINAL original versus current
with identical controls/common per-pair clocks. FINAL/current is shared, so neither
experiment can quietly change that arm. The strict day order is Aug30–Sep5 UTC.
OLD is `a88f6161197b7bf96315ae83969e49e51a833c2b`; FINAL is
`e8b867268744c0047a42d813e6024b1cf4463096`. All seven current raw hashes and the Sep2 original hash are pinned in code.

## Producer artifact contract

`{path, sha256}` references bind exact file bytes. Object digests are SHA256 of UTF-8
`JSON.stringify(value)`, preserving array and object insertion order. Generate these
with the exported `digest` helper; this is deliberately not order-insensitive JSON.
Artifacts are bounded to 64 MiB; primary/supplemental populations to 10,000 each.

Manifest: `{format: "paired-policy-matrix.v1", days: [{day, controls, current:
{snapshot, projection}, original: {snapshot, projection}}]}`. Each day has a single
controls object shared by all three executions. Supply `tenantId`, `workspaceId`,
`scope`, `config`, `limits`, `locale`, half-open UTC `periodStartedAt/periodEndedAt`,
`clock`, `ingestionCutoff`, `query`, and explicit `shadow/relatedTopic: "disabled"`.
Query uses revision-local repository field names and `timestampPolicy: "published_at"`.
Query `observedThrough`, clock and ingestion cutoff must match; Sep2 is exactly
`2026-09-09T03:34:50.293Z`. Actual capture observedThrough remains provenance.
The policy boundary does not run ranking/query/config interpretation: these are
frozen assessment provenance, not evidence that upstream behavior was executed.

Projection: `{format: "paired-policy-projection.v1", snapshotSha256,
controlsSha256, selection, candidates, supplemental, records, grouping}`.
`selection` is the JSON representation of SummaryEvidenceSelection before policy
selection, with selectedEvidence equal to the complete ordered primary candidates,
no editorialSlate/attestations, explicit recorded clusters/approvedSameStoryRelations,
and empty relatedTopicRelations for the disabled lane. `supplemental` covers all
raw supplemental IDs in order. Use genuine producer-validated SummaryEvidenceItem
projections (including unavailable legacy headlines), never old selected cards,
handwritten scores or generated singleton grouping. Explicit typed dates rehydrate;
provider metadata and microsecond timestamp strings remain untouched. Raw FeedItems
are rehydrated through each revision's own FeedItem.rehydrate.

Each assessment `record` includes `feedItemId`, nonempty `producer`, `kind`
(`model` or `deterministic`), exact serialized `request`, `requestSha256`,
`snapshotSha256`, `controlsSha256`, `rawCandidateSha256`, `sourceContentSha256`,
and `evidenceSha256`. Hash the corresponding raw candidate (or supplemental item),
sourceContent record and projected evidence item. Requests must retain candidate,
provider and promotion scope/source joins. Model records additionally reference
JSON `model`, `prompt`, `schema` provenance files by exact byte hashes; deterministic
records retain their actual named `sourceRevision`. Do not relabel legacy prompts.
Producer provenance and records are supplied evidence, not authenticated signatures.
This executor validates receipt/request/projection bindings; it does not regenerate
model requests or replay verdict object identities at the full-selector boundary.

`grouping` references a JSON receipt with the same producer/kind/request/provenance
fields, snapshot/control hashes, ordered primary `inputIds`, explicit `unclusteredIds`,
and `resultSha256` of `{clusters, approvedSameStoryRelations, relatedTopicRelations}`.
Cluster membership plus explicit unclustered IDs must partition the primary input.
An empty result needs a genuine producer receipt, not a fabricated reject-all result.
The focused test supplies a fully isolated synthetic example of this wire format.

Reports retain native OLD topReads/additionalPosts/evaluations/attestations and FINAL
slate top/additional/excluded/order/digest, plus normalized per-primary rows. Native
scores remain separate. Membership, common-item decisions, ranks, supports, clusters
and headline availability are reported separately. No published artifact ID exists:
IDs remain null, attestations remain the actual empty projection output, and citation
tokens are labeled internal preflight bindings. Supplemental admission is separate.
A missing arm produces a gap and no successful pair; other validated days may remain
as explicitly partial results. Full selectors, request-union replay, deadline outcomes,
and required original/assessment coverage remain pending beyond these commands.
