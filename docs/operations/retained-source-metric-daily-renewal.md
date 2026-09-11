# Finite daily retained HN/Reddit renewal

This incident adds seven independent single-use metric authorities for August 30
through September 5, 2026, at review base
`823aa9eb673bfa88b60ed6f3db5e50bc34059833`. Literal IDs and journal paths are in
`libs/ingestion/domain/policies/retained-metric-daily-grant.ts`. The original
3,329-row authority and spent September 8 v1 authority remain unchanged. Every day
requires the same complete original and spent-v1 lineage; no day succeeds another.

Use `scripts/run-retained-metric-daily-maintenance.sh BACKEND_SHA CONTROL_SHA`
inside the reviewed image with the existing inherited maintenance controls.
The wrapper preserves lock order 7/9/8 and the existing four-hour ceiling.
Journal order is original, spent September 8, selected day. Flags are:

- `--date YYYY-MM-DD`, required and restricted to the seven literal records;
- exactly one of `--prepare`, `--apply`, `--resume`, `--diagnostic`;
- `--manifest-sha SHA256` required only for apply/resume;
- existing `--source-sha`, `--executable-sha`, `--legacy-retirement-ref` release controls.

Standalone `--implementation` reports executable identity. There are no path,
operation-ID, round, reset, expiry-reclaim or automatic date options.

Preparation validates the complete canonical original/amendment/effect chain and
spent-v1 terminal receipts before any inventory read. Actual operation/final bytes
and directory-entry digests are pinned from
`renewal-predecessor-byte-pins-20260909.json`. The supplied `entryListSha256` is
SHA256 of compact UTF-8 JSON with sorted object keys, of filename-sorted objects
`{name, sha256}` including `operation.lock`. Existing resolver `entriesSha` remains
its separate `{name, bytesSha}` canonical contract. Pins supplement canonical
validation; they cannot replace it. Failed/unavailable terminal rows account for
spent allowance and do not assert freshness.

Only selected-day predecessor IDs are reread for the current original audit.
Both exact-ID and complete selected-day HN/Reddit inventories are read twice.
Identity drift or missing/invalid required originals refuses preparation, returning
the original audit. Mutable authority changes are recorded separately while the
first complete inventory supplies the frozen baseline. Current new arrivals are
included in the bounded frozen manifest, separate from original targets. Later
arrivals appear only in `--diagnostic`, never expanding the installed allowance.
Primary-count captures are diagnostic counts, not grants or target manifests.

Review the exact installed manifest SHA. Apply/resume rereads the frozen IDs and
uses the existing deterministic batch executor, effect validator, provider fetch
adapters and transaction sampleGuard. Limits remain 10,000 targets, Reddit batches
of 100, HN singles, one attempt, concurrency one, 10-second provider timeout.
Unknown transport/OAuth outcomes preserve reservations and stop successors;
resume cannot refetch them. Lost projection acknowledgement resumes preserved
samples under the same operation. Do not delete or rewrite any journal to retry.
Repeated preparation and validated terminal apply/resume return before DB/OAuth.
Terminal reporting separates original and new-arrival results and old-missing
audit evidence. A terminal metric result does not prove summary eligibility.

Parent alone activates September 2 first after separately owned native proof and
immediate summary capacity, then the other six one day at a time just before their
canonical summary flow. This patch adds no readiness system or scheduling service.
Do not spend a day while waiting for known runtime readiness. Prepare a new summary
cutoff at or after its observations, retain the existing six-hour metric authority
and 30-minute summary preparation/cutoff limits, and preserve regression rejection.
No X renewal, summary budget, publication authority or production readiness is
conferred by this metric change. On unknown effects or exhausted freshness, stop;
never mint another allowance or regenerate historical full workflows.
