# Bounded offline paired selector executor

The `policy` mode implements a **conditional selection-policy boundary on caller-supplied
post-assessment assertions and grouping**. That diagnostic format has no
validated producer binding: all caller assertions remain pending, and policy CLI execution
cannot certify them. Hashes bind bytes only; they do not prove execution. The full algorithm experiment remains
required. The new `full-selector` mode below executes the actual selectors as an
explicitly incomplete checkpoint; it cannot certify the experiment. No live production/model/provider/DB
clients are constructed. There is no live fallback, publication, install, or runtime
launch. `complete` always remains false; `conditionalPolicyComplete` also remains false until a concrete producer-owned
contract is implemented and independently validated. A conditional result says nothing about grouping accuracy,
model quality, generation, publication, or historical deployment identity.

Source execution uses Git object reads, without checkout/index/history changes.
Every relative import and alias resolves through the named revision's tree and
`tsconfig.json`, including barrels and transitive imports. The local TypeScript
compiler must match each revision's lock version; its actual file hash, Node
version, lock hash, tsconfig hash, tree and every loaded blob/hash are reported.
Policy mode exposes only restricted `createHash` and `util.types` builtins.
Full-selector mode additionally exposes the bounded host described below and
version-checked, byte-hashed Zod schema interpretation plus the installed gRPC
pure status enum. It never loads the gRPC client entrypoint. Other gRPC
capabilities throw. The VM denies other imports, process, network APIs and
randomness. Date stays frozen. Calls retain the ten-second synchronous limit;
cold module initialization (including recursive Git reads/transpilation) has a
separate sixty-second limit. Async work uses a bounded driver.
This is a trusted, pinned-source execution boundary, not a hostile-code sandbox.
Source loading is transpilation of the small dependency closure, not a full build.

All modifications belong to this directory. The earlier policy writer recorded
an EROFS Git-lock failure. This P3 worker makes no index or commit writes; parent
orchestration must integrate the delivered patch. Do not push or merge as part
of these commands.

## Commands

Run from the repository with both named Git objects and existing local dependencies.
No archive, dependency install, environment secrets, or additional checkout is needed.
Outputs are create-only, mode 0600, and restricted to `/tmp`; use a new output path
for each run. Inventory and missing/invalid evidence exit **2**. Policy currently always exits **2** because producer provenance remains pending.
There is no CLI synthetic bypass.

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

To inspect gaps (this cannot yet certify producer records), save a
manifest as `/tmp/reader-paired/recorded-seven-days.json`, then run exactly:

```sh
manifest_sha=$(sha256sum /tmp/reader-paired/recorded-seven-days.json | cut -d ' ' -f 1)
node scripts/evals/reader-paired-experiment/run.cjs --mode policy --manifest /tmp/reader-paired/recorded-seven-days.json --sha256 "$manifest_sha" --out /tmp/reader-paired/conditional-seven-days.json
```

The intended conditional comparison covers two separate seven-day experiments: OLD versus FINAL on
identical current snapshots/projections/controls, and FINAL original versus current
with identical controls/common per-pair clocks. FINAL/current is shared, so neither
experiment can quietly change that arm. The strict day order is Aug30–Sep5 UTC.
OLD is `a88f6161197b7bf96315ae83969e49e51a833c2b`; FINAL is
`e8b867268744c0047a42d813e6024b1cf4463096`. All seven current raw hashes and the Sep2 original hash are pinned in code.

## Caller assertion wire format (not a producer contract)

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
This executor validates structural receipt/request/projection bindings only and
keeps every candidate pending. It does not regenerate
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

## Regression boundary

Run `node --test scripts/evals/reader-paired-experiment/*.test.cjs`. Direct policy
tests explicitly pass `syntheticPolicyTest: true`; outputs say
`synthetic_policy_test_only` and retain pending producer coverage. No synthetic
flag in a manifest enables execution. Unresolved quality records raise gaps with
IDs/counts before selection, and primary/supplemental ordered coverage is checked
separately. Claimed accepted headlines must pass the pinned FINAL
`readerPostDisplayHeadline` validation even for OLD inputs. This validates shape,
source, support and bindings, not producer execution or prompt approval. Input
headline availability is separate from admission. Missing coverage is never
inferred to be zero from successful synthetic selection.


## Actual full-selector checkpoint (P3)

`revision-full-selector.cjs` constructs the **named revision's** real
`RelevanceReaderSummaryEvidenceSelector` and `RankFeedItemsUseCase`. OLD
`a88f6161197b7bf96315ae83969e49e51a833c2b` deterministically assesses its raw
population and never reads configured interests or calls the quality reviewer.
FINAL `e8b867268744c0047a42d813e6024b1cf4463096` creates its actual assessment
adapter. Both execute their genuine clustering, relation reconciliation,
reduction and admission. Selection stops before any summary job or publication.

Input is the concrete P2 `reader-refresh-paired-capture.v1` directory, referenced
by the exact hash/path of `complete.json` or `incomplete.json`. Every listed file
is checked for regular-file type, size and hash, with bounded bytes/events and
unique journal sequences. Inputs hydrate through revision-local `FeedItem`;
primary/supplemental raw order, full bodies, source joins, exact timestamp strings,
metric authority and arbitrary metadata survive. The snapshot port matches all
query fields and present-key semantics. Interest reads match exact scoped
recorded requests. Other feed/profile/memory capabilities fail into a sticky
ledger. A complete P2 marker is capture metadata, never experiment authority.

The real quality and relation adapters build commands, validate output
attestations and run their concrete parsers over P2 model responses. Matching
includes the full actual assessment request or relation query, context, lane,
prompt, schema, controls and original transport identity. Changed input does not
reuse a candidate-ID response. Parsed reviews/decisions must equal the corresponding
P2 terminal values; FINAL's produced verdicts require the exact complete,
duplicate-free attempted candidate inventory and matching values.
`recorded-request-admission.cjs` additionally executes the pinned concrete
`admitSubscriptionRuntimeRequest` and canonical JSON hash functions used by P2.
The captured canonical request hash must match before a response is supplied.
Its three-file admission closure includes the canary contract through a narrow
virtual filesystem serving only that immutable Git blob; no host filesystem,
executor or live client becomes accessible. Admission consistency is reported
per consumed record and remains separate from unverified producer origin. Relation
fail-closed catches cannot erase missing requests. The ledger retains exact
requests and shared immutable tape/event IDs for subsequent union recovery.
Original transport IDs and attestations are never rewritten.

Rank-result, cluster-method and named stage-function wrappers only observe actual
invocations. The exported period/default-provider filters, supplemental policy,
verified relations and promotion-policy inputs/outputs are retained from the
actual call. Async observation returns the original promise; failures are
reported separately. Wrappers are restored before later projection/admission. No
pinned blob is edited, no grouping is injected and no second ranking pass runs.
All ranked identities are reindexed into the original two partitions.
`selector-preparation-trace.cjs` builds the complete P2 FINAL preparation shape
from these observations: stage-local exclusions, both genuine groupings,
unclustered IDs, relation candidates/pairs, graduated relations, policy input and
admitted supplemental items. P2's pre-sort rank field is compared by undoing the
source's final rank assignment; ranking order is retained independently. This
is explicit derived normalization, not a claimed pre-sort callback. All captured
promotion/preparation/selection fields must match, including the complete raw
partitions. OLD retains its own multiple stages without interpreting them as
FINAL's preparation contract. Missing projection files are capture gaps, not
missing model requests. Content equality never establishes producer origin. Full
mapped and ranked inventory, request eligibility, attempted IDs, native
scores/placements, reject/abstention/pending/exempt/hard-gate states, grouping
calls and admitted supplemental evidence remain separate. Wrappers and host
hashes are reported separately from the complete immutable source closure.

### Controlled timing, explicitly incomplete

The host implements only the primitives required by this tested slice:
AbortController, controlled AbortSignal timeout/any, structuredClone, Buffer,
registered timeout handles, clearTimeout, setImmediate/clearImmediate, and
ref/unref bookkeeping. It flushes real Promise microtasks through Node's check
phase and then runs scheduled shadow callbacks. It never sleeps on wall timers
or advances the editorial cutoff. Timer-dependent awaits stop with
`precise_timing_replay_required`; registered deadline callbacks are **not** fired
at invented times. The driver is capped at 256 turns.

Only recorded same-millisecond completed envelopes enter the immediate-response
path. Nonzero elapsed, observed deadline/abort, failed and still-pending events
remain named gaps, with their original recorded times/outcomes retained. Their
source-produced pending rows are diagnostic outcomes, not claims that precise
historical timing was reproduced. Even same-millisecond records cannot prove
historical microtask/timer ordering. Every arm therefore reports
`historicalTimingVerified:false`, `actualProducerVerified:false`, `complete:false`.
No synthetic flag or self-hashed attestation can change those values. Missing
responses and unresolved candidates have different counters; newly changed
pending assessments can discover additional missing downstream relation requests.

### Full-selector CLI

```sh
NODE_OPTIONS=--max-old-space-size=1536 node scripts/evals/reader-paired-experiment/run.cjs \
  --mode full-selector --manifest /tmp/paired-full.json --sha256 EXACT_FILE_SHA256 \
  --out /tmp/paired-full-results.json
```

The manifest format is `paired-full-selector-matrix.v1`, with exactly the seven
ordered days already listed above. Each day has `current.capture` and
`original.capture` references (`{path,sha256}`), optional `responsePool` capture
references, and shared `modelControls`:

```json
{
  "assessment": {"batchTimeoutMs": 300000, "totalTimeoutMs": 600000},
  "relation": {},
  "relatedTopicVerifierTimeoutMs": 15000
}
```

These numbers describe the supplied synthetic example, not inferred controls
for any real operation. Relation omissions use the pinned adapter defaults.
Actual captured controls still need an independent authority/binding audit.
Three arm slots are retained per day; available arms actually execute. Seven
algorithm comparison rows and seven separate FINAL original/current rows are
always emitted, with missing arm counts null. FINAL/current is executed once
and its exact digest is reused in both comparisons. Data-pair controls must
match (query, snapshot query, interest returns) before differences are emitted.
Every comparison is partial and the CLI always exits 2 in this checkpoint.
Existing diagnostic policy mode remains fail-closed; there is no fallback to it.

### Portable synthetic example and focused checks

`fixtures/p2-synthetic-capture.json` is machine-copied callback data from P2's
explicitly synthetic example. It retains four primary plus twelve supplemental
identities and the concrete assessment/relation tapes. Large producer projections
are omitted so tests have to recompute grouping and selection. Its exported seal
is deliberately incomplete. This is fixture input, never a historical original
or native provider attestation. The FINAL example resolves two assessments,
abstains on one, preserves one hard gate and twelve GitHub deterministic branches.
The example also makes an explicitly synthetic original population by removing
three supplemental identities, then runs all three arms for that day; the other
six days remain named gaps. OLD discovers a different, missing relation request. A separate regression feeds
a real parsed rejection and a rehashed binding forgery.

```sh
# Check available memory first. Use a fresh create-only destination.
NODE_OPTIONS=--max-old-space-size=1536 node scripts/evals/reader-paired-experiment/write-full-selector-example.cjs \
  /tmp/paired-full-selector-synthetic-example
NODE_OPTIONS=--max-old-space-size=1536 node --test --test-concurrency=1 scripts/evals/reader-paired-experiment/*.test.cjs
npm run check:architecture
npm run check:code-quality
npm run check:source-line-cap
```

### Exact remaining work before experiment completion

1. Implement and test actual recorded execution-time/deadline ordering, including
   before/at/late/cancellation, batch and total deadlines and overlapping lanes.
   Keep execution elapsed time separate from immutable editorial cutoff. This
   checkpoint intentionally does not implement a universal scheduler.
2. Validate concrete producer origin, source/runtime/policy/config authority
   and all canonical/exempt/full-source bindings. Canonical runtime request
   admission and output hashes are now recomputed through real pinned functions;
   that consistency still cannot establish the capture's actual origin.
3. Run the implemented field-by-field P2 promotion/preparation/selection audit
   over real recovered populations and source-controlled captures. Synthetic
   complete-field equality and stage tampering are tested; remaining parser,
   headline and grouping/lane stress cases still need coverage.
4. Recover six historical original full snapshots and their actual controls;
   bridge the established eight raw files to verified P2 inputs without replacing
   populations. Recover exact OLD/FINAL/original/current request union, including
   all related-topic/shadow requests. No new live calls are authorized here.
5. Run the full 21-arm/14-pair matrix twice with verified raw/control/source pins,
   prove repeated equality and fully resolved coverage. Until then no seven-day
   completion, no quality-gain/no-signal conclusion, no publication IDs.

This is a useful actual-selector implementation checkpoint within the P3 file
lease, not the entire acceptance matrix or a production-certified experiment.

The zero-elapsed host drains nested Promise reactions between individual immediate
callbacks, matching the tested Node cancellation ordering. A microtask from the
first callback can cancel a later queued callback; newly queued immediates remain
in the next replay batch. Rejected promises retain falsy rejection reasons and
cannot silently become successful results. These host checks do not certify
historical timer/deadline ordering or advance the frozen editorial clock.

Response observations retain the full associated P2 model journal, including
invocation abort and envelope-not-consumed events with their original sequence
and timestamps. Even same-millisecond abort/deadline events require precise
timing replay; a verified envelope alone cannot override them. Both assessment
and relation calls reject overlapping response slots until lane timing can be
replayed without overwriting another call's binding.

A response union rejects conflicting observations of the same semantic request.
Identical commands and envelopes are insufficient when another tape disagrees
on abort events, completion times, parsed reviews or verdict inventory. This
ambiguity is sticky and independent of response-pool order; it cannot silently
select the first tape's outcome.
