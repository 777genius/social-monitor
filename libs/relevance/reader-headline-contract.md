# Promotion reader headline: relevance handoff

Scope: accepted plan phases 1–3, relevance ownership only, based on
`fa6bb2036d792bcc868d3cd795ffe1c0fb3f169f`. Summary mapping in phase 3 and all
projection, persistence, API, Flutter, native/live proof remain integration work.
This annotation does not enable a new publication path.

## Stable exported contract

`@social-monitor/relevance/domain` exports `PromotionReaderHeadline`,
`PromotionEvidenceReference`, `PromotionHeadlineQualification`,
`PromotionHeadlineUnavailableReason`, `unavailablePromotionHeadline`,
`isRoundTrippingHeadlineText`, and `isConcisePromotionHeadline`.
`RankedFeedItemView.readerHeadline?: PromotionReaderHeadline` carries the value.
Absent annotations (legacy, ordinary ranking, supplemental sources) mean
unavailable, never permission to synthesize a title. Promotion candidates get an
explicit accepted/unavailable annotation, including hard-gated candidates.

Accepted fields:

| Field | Meaning / guarantee |
| --- | --- |
| `status` | Literal `accepted`, produced by application validation, not wire input. |
| `kind` | `claim` or `subject_label`. |
| `text` | Exact, unnormalized string, 1–119 JS UTF-16 units. No slicing. |
| `binding` | Candidate ID, provider key, tenant/workspace/interest, source binding/item IDs, trusted intent, complete review availability and reviewed-input digest. |
| `binding.availability` | `body_present` or `title_only`; never `truncated`. Capture completeness means available captured text, not a fetched full publication. |
| `binding.reviewedInputDigest` | Existing SHA-256 request binding, lowercase hex. Authenticated by the adapter against the exact invocation. |
| `support` | 1–8 exact source references, copied and frozen. |
| `qualifications` | Explicit list of `{phrase, evidence}`; phrase occurs verbatim in headline, references match source exactly. |
| `confidence` | Independent finite headline confidence, at least 0.8 and at most 1. |
| `wholeInput` | Exact reviewed title/body lengths and model judgment `none`, `preserved`, or `subject_only`. |

Unavailable fields are only `status: unavailable` and a bounded `reasonCode`:
`not_assessed`, `invalid_assessment`, `incomplete_source`, `unsafe_text`,
`unresolved_qualifications`, or `insufficient_support`. Reasons contain no source
text. Consumers must not interpret unavailable as a ranking veto.

Reference coordinates are JS UTF-16 `[start,end)` in `title` or `bodyPreview` of
the exact safety-processed review request. Quotes are exact slices, not Unicode
normalized strings. Astral characters occupy two units; combining marks retain
their original representation. Unknown/missing own keys, invalid offsets, empty
quotes and duplicate references within one list fail closed. At most eight serialized quote occurrences across support and qualifications
are accepted, counting repeated coordinates again. Each quote is at most 256
UTF-16 units; all quotes together are at most 512 units and 1024 serialized
JSON units (including escaping and quote delimiters). Qualifier
phrases cannot be duplicated. No input or output list is truncated to pass.

The existing digest is SHA-256 of UTF-8 `JSON.stringify({candidateId, providerKey,
context: promotion, title, body: bodyPreview ?? ""})`, in that property order.
The production context order remains tenantId, workspaceId, interestId,
sourceBindingId, sourceItemId, trustedIntent, availability. Reuse that exact
material; do not sort, normalize, omit trusted intent, or replace available source
with a preview. There is no second digest algorithm or new version framework.

## Producer validation and trust boundary

The existing batch schema adds `readerHeadline` with proposed status `available`
or explicit `unavailable`. Available proposals carry kind, text, support,
qualifications, confidence and wholeInput. The adapter authenticates bindingId
before supplying internal `headlineInput` (request identity, digest and exact
reviewed strings). That metadata is trusted port output, not model output.
Old responses may retain valid quality results without headline authority.
Applications must not fabricate this metadata from caller-supplied digests.
Only the accepted value crosses into the ranking result; request objects do not.

Whole-input `none` requires an explicit empty qualifications list; `preserved`
requires nonempty qualifications with source and headline coverage. `subject_only`
requires an empty list and exact deterministic rendering: one source-backed
proper-name token, optional exact `v1`/`v1.2`/`v1.2.3` token, one exact topic noun
from benchmark/compiler/model/editor/API/release/safety/latency, then ` discussion`.
Subject slices must have complete surrounding token boundaries: Unicode letters,
marks, numbers, connector/dash punctuation, format characters, dots, plus signs
and apostrophes conservatively count as continuations. Even an adjacent sentence
dot can cause unavailability; punctuation is never stripped. The model must judge the relationship unambiguous; unsupported grammar or
ambiguous identity returns unavailable. This bounded grammar deliberately limits
coverage rather than accepting arbitrary factual noun phrases.

The 12,000 body / 2,000 title limits, 256,000 available-source safety cap, batch
counts/bytes/deadlines and 6,000 output-token cap are unchanged. Truncated input
cannot authorize any headline, including a neutral label. Strings with NUL or
unpaired surrogates cannot authorize display. Text requiring safety rewriting,
multiline/control/bidi-control text, markup, URLs or ellipses is rejected without
mutating the source. The summary consumer must additionally apply its existing
reader-facing polish/filler policy and revalidate exact source/binding identity.

References and phrase coverage prove structure/provenance, not arbitrary-language
entailment. Whole-input judgments and entity relationships are bounded model
verdicts. Synthetic adversarial tests validate their handling, not live model
accuracy. Independent semantic evaluation remains a release gate. Never claim
formal entailment from this contract or authorize publication using a self-digest.

## Integration invariants and non-goals

`assessPromotionContent` returns `{verdicts, readerHeadlines}`. The original
quality verdict algorithm, score/flag merging and reference acceptance behavior
are unchanged. Display failures do not alter scores, rank, candidate selection,
sourceText/title/bodyPreview, support, metric reasons or slate digest inputs.
The exact-reference helper was extracted without strengthening old quality rules;
strict annotation-only checks are separate.

No per-post provider call, model/version upgrade, platform, fetch, historical
rewrite, database/schema/generated API edit, deployment or X-protocol change is
included. The shared promotion wire automatically reaches both existing model
adapters through the existing parser; no duplicate adapter metadata path is added.
Test fixtures live in `test/support` to keep feature imports inward.

The summary owner must map this contract into its own value, preserve full source
separately, reject publication of selected unavailable headlines without dropping
or refilling selections, seal exact headline/source identity, and transport the
stored fields unchanged. Phase 4–6 completion is not claimed here.

## R1/R2 correction and remaining capacity gate

The exported accepted/unavailable shape and reason codes are unchanged. Tightened
headline-only evidence budgets can turn formerly accepted proposals unavailable;
consumers must retain the publication rejection gate. Legacy quality evidence
validation is unchanged. The model schema caps each headline quote at 256 Unicode
code points; application validation additionally enforces the stricter UTF-16 and
aggregate budgets, including repeats and JSON escape expansion. Invalid headline
annotations in complete, authenticated responses within the existing global cap
do not invalidate otherwise valid quality verdicts.

The shared prompt allocates at most 1000 output tokens to all headline objects
in a batch, divided by candidate count including JSON overhead. Original quality
fields for every candidate take priority; inability to fit complete qualifications
requires explicit unavailable/unresolved_qualifications, never omission or slicing.
This is a conservative instruction, not a tokenizer-enforced capacity guarantee.
No global cap, batch size, call count, model or timeout was raised or changed.

Whole-response truncation, malformed JSON, missing completion and responses over
128000 bytes still fail closed as before, and can still lose quality results.
The parser does not solve catastrophic output truncation. The runtime's 6000
output tokens and OpenAI default 4000 tokens are not guaranteed sufficient for
the original quality fields plus annotations. Full system instructions/schema
are also outside the existing 64000-byte candidate-prompt measurement. No live
provider or tokenizer measurements were performed. Separately authorized live
whole-input semantic and output-capacity evaluation (all eight candidates, long
and multilingual inputs, late retractions/qualifiers, exact UTF-16 counts,
quality/selection parity, deadlines and provider completion limits) remains
required before semantic production claims. Assertive publication must remain
unavailable/disabled until that gate passes; these synthetic tests do not prove
that a model detects an omitted qualification or arbitrary-language entailment.
