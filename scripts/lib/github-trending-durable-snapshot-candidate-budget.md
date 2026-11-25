# GitHub durable candidate capacity

This reader admits the existing 200-row transport capacity without rejecting a
valid day's repeated captures merely because their full JSON exceeds 256 KiB.
The Sep 8 parent read on audited source `ad58` measured 150 candidates, 15
generations and 342,536 normalized UTF-8 JSON bytes for Sep 7, scope 6101/6102,
binding 6111. These measurements are parent-supplied evidence, not a query run by
this implementation worker. The old 262,144-byte gate failed before generation
selection. At 150 rows it allowed only 1,747.63 bytes per candidate; the measured
average was 2,283.57. Keeping that gate retains the demonstrated false failure.

## Decision and equivalence

Use the permitted derived-capacity adjustment, with independent allocation
bounds, rather than moving text equality, control-character and hashing policy
into SQL. This keeps JavaScript's exact existing Unicode, trimming, byte-length,
case and digest behavior and avoids introducing SQL/JavaScript equivalence
assumptions into the proof. No content is summarized, normalized or omitted.

The exhaustive typed field budget matches all 44 statement result fields:

- Eleven UUID columns: 36 code points each (native UUID text is ASCII).
- Four normalized native timestamps: at most 27 characters, including extended
  years. Metadata timestamps retain their existing 64-code-point caps.
- All other text: existing SQL `left` caps, plus 64 for the two provider keys and
  32 for the two statuses which previously lacked explicit transport caps.
- Six numeric fields: three bounded 32-character metadata values converted with
  `Number`, and three `octet_length` integers converted with `Number`.

The exact per-field mapping is executable in
`github-trending-durable-snapshot-candidate-budget.ts`; the SQL projection test
checks every alias against its cap or native typed source. The type mapping is
exhaustive, so adding a candidate field requires adding a corresponding bound.

The four added SQL caps cannot turn invalid evidence into a valid constant:
`github-trending-page` has 20 characters, `VISIBLE` seven and `SUCCEEDED` nine,
all strictly shorter than their respective caps. An overlong string remains
longer than the valid constant after truncation. These fields do not participate
in ordering or generation identity. SQL NULL remains NULL (the pre-existing
scan-status coalesce remains unchanged). The broad six-arm day predicate,
source/feed binding OR, scoped join, left scan join, feed-id order and LIMIT 201
are unchanged. There are no status/visibility filters and no newest-ten SQL
shortcut. All evidence still comes from one statement snapshot.

Selection, newest-invalid rejection, lineage, tenant/workspace/binding guards,
visible-text and declared-byte validation, content hashes, proof fields and
canonical proof digest are unchanged. A sentinel truncated title/preview still
fails the existing full byte-count/length checks. Resource bounds do not certify
content: even a maximum-sized transport envelope must pass the existing verifier.

## Derivation and allocation bounds

For each capped string of N Unicode code points, JSON needs at most `2 + 6*N`
UTF-8 bytes. ASCII is one byte, unescaped Unicode at most four, quote/backslash
escapes two, and control escapes such as `\u0001` six. A lone UTF-16 surrogate
also serializes to six bytes; PostgreSQL does not emit these, but fake/custom
readers are bounded too. NULL uses four bytes and fits every string field's
bound. The application checks code-point counts without allocating a character
array, with an initial O(1) UTF-16-length bound of `2*N`.

Each JavaScript Number serializes to at most 25 ASCII bytes: the longest fixed
form has sign, `0.`, five leading zeroes and 17 significant digits (25); the
exponent form is shorter. Nonfinite values serialize to `null` (four bytes) and
remain ineligible wherever the original verifier requires a valid integer.

For each property, add its quoted ASCII key, colon, value, and comma. Replacing
the last comma with `}` leaves one additional byte for `{`. Summing all 44 fields
(8,347 capped string code points and six numbers) yields **51,110 bytes per row**.
The 200-row array bound is `1 + 200*(51,110+1)` = **10,222,201 bytes**. This is
an attained worst case in the executable boundary test, not a rounded threshold.
Replacing one six-byte escape with seven ASCII bytes proves exact +1 rejection.

The larger logical ceiling is a capacity tradeoff, not a 10 MB JSON allocation:

- SQL returns at most 201 rows, with independently capped text columns. Overflow
  is rejected before visiting rows or serializing values.
- Every accepted transport row has exactly the expected own keys and primitive
  types (or SQL NULL for text), with a per-field code-point bound.
- Only a captured, already bounded primitive is serialized to count bytes. No
  candidate object or candidate array is serialized. The largest temporary JSON
  string is the 4,097-code-point preview: at most 24,584 characters/UTF-8 bytes,
  or 49,168 bytes of UTF-16 character storage.
- Row and cumulative byte ceilings are checked independently of the row and
  per-field ceilings. For nonempty arrays of ordinary plain records, this count equals the full
  normalized array's JSON byte length, regardless of property order.
- A conservative string-character-storage bound for 201 mapped rows is
  `201*8,347*4` = **6,710,988 bytes**, excluding object/driver overhead and native
  numbers/Dates. Raw and normalized rows share text strings through the existing
  spread mapper. This is not a measured process-RSS or concurrency guarantee.
  Up to 10,222,201 bytes of cumulative serialization work can produce temporary
  garbage before GC; the small per-value allocation bound is not a peak-heap bound.
  Database scan/TOAST work and driver overhead are not bounded by this calculation;
  they also existed before this change. Native parent verification remains needed.

The old gate allocated the entire candidate JSON before checking its size and
had no corresponding application per-field preflight. The new guards bound
allocation before serialization and close the four uncapped SQL text columns.
No row ceiling is increased: twenty ten-row captures fit; a twenty-first still
fails. There is no change to scheduling, retention, ranking or freshness.

## Deterministic evidence and release boundary

The synthetic fixture uses UUID-shaped identities and generated, non-production
text. Fifteen individually valid ten-row captures serialize to exactly 342,536
bytes; this matches the incident size without pretending to reconstruct its
content. Fourteen, fifteen and twenty distinct generations all select the same
latest-ten proof as reading their latest ten alone, in fake Prisma and in-memory
readers. The fifteen-generation proof digest is pinned to the unchanged audited
reader's digest for those same synthetic latest-ten rows:
`sha256:425e9c71ca1e1c25da6dc9dc258de95fa28958aced8114ff1d00a5bb43ccf7cc`.
The unchanged reader rejects the complete synthetic fifteen-generation array.

Tests cover exact maximum/+1 bytes, 200/201 rows, every text cap/+1 for ASCII,
multibyte Unicode, surrogate and JSON escape forms; malformed shapes; SQL
projection caps; malformed older ordering; newest failed/missing/incomplete,
hidden and mismatched evidence; control characters; 512/513 title and 4096/4097
preview bytes; exact declared byte counts; equal-length unequal titles; Unicode
normalization differences; and invalid provider/status truncation prefixes.
Existing reader/acquisition/quality tests remain required.

No DB, migration, provider-network, auth, runtime, install, commit, push or deploy
operation is part of this patch. Observations and historical captures are
unchanged. Parent native/live read-only parity, independent review and mechanical
commit are required before release; fake tests do not establish production repair.
