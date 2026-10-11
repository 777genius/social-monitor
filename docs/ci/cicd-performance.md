# CI duration balancing and timing

Backend coverage still runs exactly four shards, once, with PR1's complete
inventory/execution-union proof and always-running aggregate. The sequencer
changes membership using deterministic longest-processing-time assignment:
suite duration descending, canonical repository path ascending, then the lightest
bin (ties: fewer suites, then lowest bin index). Input order and local Jest cache
membership cannot change assignment. Jest's installed sort/cache implementation
is inherited, including failed-test priority within a shard. Any positive Jest
shard denominator and `--listTests` work; bins beyond the inventory are empty.

`ops/ci/jest-durations.json` is generated compact data (two measurements per line).
Its 995 weights are actual suite `endTime - startTime` milliseconds from successful
GitHub run **37040676496**, source
`1360f9326dcf78ed9d43ef2c6733957c12ecfb71`. The host verified that source tree equals
merged main `c9dd4f5b903c777a6a378e3233b5353d08702424`; these are distinct commit
SHAs. Provenance records the verified archive checksum and exact execution JSON
checksums. The full four-report union passed: 995 suites, 15,148 assertions.

Measured original shard suite-time sums were 201.434, 503.306, 258.616 and
513.490 seconds. LPT assigns 243/250/251/251 suites with estimated sums
369.213/369.207/369.213/369.213 seconds. These are historical suite-time estimates,
**not measured future Actions wall times**. Unknown suites use the median measured
weight (currently 129 ms), including partial datasets; deleted manifest entries
never create suites. Refresh can remove deleted weights and reports unknowns.
Malformed, oversized, negative, nonfinite and unsafe-path weights fail closed.

## Refresh from verified successful source data

The binding is a trusted host-generated attestation of the source run's exact
head, successful conclusion and artifact archive SHA256. Verify the downloaded
archive against that checksum before extracting. The refresh CLI validates this
binding against `--source-sha`, reuses PR1's full inventory/unique execution proof,
requires real suite timestamps and records SHA256 of each raw execution report.
It does not fetch/authenticate the attestation or independently download the
archive. PR1's tracked-source proof remains the authoritative CI inventory gate.

```sh
node scripts/ci/refresh-jest-durations.mjs \
  --reports node_modules/.cicd-evidence/gha-ci-pr1-unit-reports \
  --binding node_modules/.cicd-evidence/gha-source-binding.json \
  --source-sha 1360f9326dcf78ed9d43ef2c6733957c12ecfb71 \
  --report-root /home/runner/work/social-monitor/social-monitor \
  --out ops/ci/jest-durations.json
```

Optional `--current-inventory FILE` accepts canonical repository-relative Jest
inventory JSON to filter deleted suites and report new unknowns. Never manufacture
weights for unknown suites. A source run that failed or was interrupted is rejected.

## Flutter caches

Keep the existing pinned subosito action, stable channel and `.fvmrc` version-file
contract. An earlier step resolves and validates the exact stable SDK version.
Both SDK and pub-cache keys include runner OS, architecture, that resolved version
and `hashFiles('apps/frontend/**/pubspec.lock')` before dependency resolution.
The glob covers every checked-out lockfile, including future app/feature/package
locks (the current workspace has one shared root lock). Patch SDK bumps and any
lock change invalidate both keys. Ordinary Dart-only changes preserve the keys.
The guard parses YAML and rejects disabled caches, floating versions, missing
key dimensions, narrower lock globs, conditional setup and version overrides.

## Measure completed Actions runs

Use the read-only `gh api` adapter after a run finishes. Supply the exact API head
SHA for both runs; a PR head/squash SHA substitution fails. No new workflow job is
added: an in-run collector cannot observe its own final wall time.

```sh
node scripts/ci/actions-timing-report.mjs --repo OWNER/REPO \
  --run CURRENT_RUN_ID --head CURRENT_EXACT_SHA \
  --baseline-run 37040676496 \
  --baseline-head 1360f9326dcf78ed9d43ef2c6733957c12ecfb71 > timing.json
```

The CLI invokes only `gh api --method GET`, using existing gh authorization; it
does not read credentials. It pages jobs for the exact run attempt and verifies
that attempt/head/status/update timestamp stayed stable while fetching. Reports
contain run result, wall seconds (`updated_at - created_at` for a completed run),
execution window, sum of active runner minutes and each job's result/duration.
GitHub exposes the run's final update time rather than a dedicated completion
field; post-completion updates can affect this wall-clock convention.

Per-job `queueSeconds` is `started_at - created_at` when job creation time exists.
Older GitHub responses omit job creation time: queue is null and separately
labelled `waitSinceRunCreatedSeconds` includes dependency/DAG wait. Missing or
invalid timings stay null with issues; known runner minutes remain available,
while the full sum stays null when incomplete. Skipped jobs without timestamps
use zero; cancelled jobs with incomplete timestamps stay unknown. The longest
job uses measured durations. Overlapping runner time is summed, not confused
with run wall time. No concurrent-run quota diagnosis is inferred from these data.

## Focused validation

```sh
node --test scripts/ci/jest-duration-sequencer.test.mjs \
  scripts/ci/refresh-jest-durations.test.mjs scripts/ci/actions-timing-report.test.mjs
node node_modules/jest/bin/jest.js --config jest.config.ts --runInBand \
  --runTestsByPath scripts/check-review-ci.spec.ts
```

Local worker uses the explicit `node_modules/.cicd-tools/node22` executable.
Host-provided real-report checks skip on environments without those ignored
artifacts; synthetic algorithm/invalid-input/real-Jest API tests always run.
The controller owns full real CI/E2E and the final Flutter gate.
