# Reader Summary Promotion V2 historical rebuild

This command classifies closed UTC daily publications and, only with
`--execute`, regenerates them through the existing production-day model and
`PrismaReaderSummaryPublication.publish_reader_summary` path. Dry-run is the
default. It never starts a durable job, invokes a model, acquires a mutation
lock, or switches a publication pointer.

The command is not a deployment or migration-execution authorization. Prepare
and review the evidence manifest with read-only access first. Do not include the
current UTC date or either legacy weekly publication slot.

## Evidence manifest

`--artifact-manifest` points to immutable JSON with this shape. Paths may be
absolute or relative to the manifest. Every file digest and the canonical
input digest are recomputed before a date can mutate.

```json
{
  "schemaVersion": 2,
  "format": "reader-summary-promotion-v2-historical-evidence-manifest-v2",
  "policyVersion": "reader_post_promotion.v2",
  "entries": [
    {
      "date": "2026-08-30",
      "authoritativeInputDigest": "<64 lowercase hex>",
      "sourceAuthority": {
        "kind": "active-database-publication",
        "publicationId": "<active V1 publication UUID>",
        "artifactId": "<active V1 artifact UUID>",
        "reportSha256": "<64 lowercase hex>",
        "proofSha256": "<64 lowercase hex>"
      },
      "datasetManifest": { "path": "2026-08-30/dataset.json", "sha256": "<64 lowercase hex>" },
      "timestampPolicy": "published_at",
      "allowHistoricalGitHubOmission": false
    }
  ]
}
```

The active-database authority is the V2-only admission for a closed date whose
posts and active publication artifact/proof remain in the database but whose
old successful production-day report was not preserved. It does not invent an
old run or weaken the existing recovery validator. A legacy manifest may use
`kind: "preserved-production-day-report"` and additionally provide hash-bound
`sourceReport`, `collectionArtifact`, and `collectionQualityReport` files; that
path still requires the complete successful production-day receipt.

The canonical semantic digest binds the date, `reader_post_promotion.v2`, active
source publication/artifact/report/proof, the dataset aggregate and constituent
hashes (feed rows, source rows/provider metadata, and GitHub eligibility), row
counts/provider counts, the timestamp/GitHub policies, and any legacy supporting
evidence-file hashes. The evidence manifest separately binds the exact dataset
manifest file SHA for tamper detection and under-lock revalidation. Operational
capture metadata such as `generatedAt` and that resulting file SHA are excluded
from semantic identity, so recapturing unchanged data does not create a new
rebuild identity. Execution revalidates the dataset and active source under the
real global/date lock before starting the production-day child. The
transactional dataset guard still checks again immediately before publication.

## Read-only preparation for dates without a preserved report

Use `--prepare` to classify the explicit closed dates, read the active daily
publication/artifact/proof, and capture a fresh immutable canonical dataset.
This mode performs database reads only and never invokes a model, creates a
durable job, acquires a mutation lock, or changes a pointer:

```sh
npm run reader-summary:promotion-v2-historical-rebuild -- \
  --prepare \
  --dates 2026-08-29,2026-08-30 \
  --batch-size 2 \
  --artifact-output /var/data/social-monitor/artifacts/promotion-v2-input
```

Review the generated preparation receipt and
`reader-summary-promotion-v2-historical-evidence-manifest.v2.json`. Use a
separate `--artifact-output` directory for dry-run/execute receipts. Preparation
reports missing posts as unrebuildable and missing publication/proof/dataset
evidence as pending; an absent old report alone is not classified as absent
data. The fresh dataset manifest expires after 30 minutes, so prepare again if
review cannot finish within that window.

For a date with no preserved GitHub rows, set
`allowHistoricalGitHubOmission` to `true` and include a privacy-safe
`historicalGitHubOmissionReason` of 20-500 characters. Missing or malformed X
authority is recorded as a provider limitation; it must not be defaulted to an
original post or supplied with invented engagement.

## Classification dry-run

```sh
npm run reader-summary:promotion-v2-historical-rebuild -- \
  --dates 2026-08-29,2026-08-30 \
  --batch-size 2 \
  --artifact-output /var/data/social-monitor/artifacts/promotion-v2-rebuild \
  --artifact-manifest /var/data/social-monitor/artifacts/promotion-v2-input/reader-summary-promotion-v2-historical-evidence-manifest.v2.json
```

Omitting `--artifact-manifest` is permitted for classification-only dry-runs;
rebuildable dates then remain pending with
`hash_bound_input_evidence_missing`. A date is reported as:

- `exact-replayable` only when complete structurally valid promotion authority
  was observed before its original UTC day ended;
- `rebuildable-from-authoritative-input` when retained canonical provider
  metadata can drive a current-authority rebuild, with provider limitations
  retained in the receipt; or
- `unrebuildable` with `no_visible_feed_rows` or
  `no_structurally_valid_authoritative_promotion_metrics`.

## Reviewed production invocation

After dry-run receipts and the manifest are independently reviewed, provide the
same lock used by `daily-run.sh`, the shared date-lock/fence directories, the
Reader Summary API URL, and the already-configured production-day runtime
environment:

```sh
export READER_SUMMARY_PROMOTION_REBUILD_DAILY_LOCK_PATH=/var/data/social-monitor/control/daily-run.lock
export READER_SUMMARY_PROMOTION_REBUILD_DATE_LOCK_DIR=/var/data/social-monitor/artifacts/reports/reader-summary-production-v2/.reader-summary-date-locks
export READER_SUMMARY_PROMOTION_REBUILD_FENCE_DIR=/var/data/social-monitor/artifacts/reports/reader-summary-production-v2/.reader-summary-date-fences
export READER_SUMMARY_PROMOTION_REBUILD_API_BASE_URL=http://127.0.0.1:3000

npm run reader-summary:promotion-v2-historical-rebuild -- \
  --execute \
  --resume \
  --dates 2026-08-29,2026-08-30 \
  --batch-size 2 \
  --artifact-output /var/data/social-monitor/artifacts/promotion-v2-rebuild \
  --artifact-manifest /var/data/social-monitor/artifacts/promotion-v2-input/reader-summary-promotion-v2-historical-evidence-manifest.v2.json
```

If API reads require an API key, put its raw value only in
`READER_SUMMARY_PROMOTION_REBUILD_API_KEY`; the verifier sends it as a bearer
credential and never writes it to receipts. `--resume` is required after a
pending receipt. An in-flight, failed, rejected, detached, or ambiguous durable
state remains pending for reconciliation and is never retried as a new model
operation.

At most two dates are classified concurrently. Mutating rebuilds also acquire
the actual daily-run admission lock, then the shared per-date lock and monotonic
fencing token. Under that lock the child re-reads the immutable manifest,
recomputes the current database dataset, and verifies the active publication,
artifact, report hash, and proof hash. Drift returns
`authoritative_input_drift_under_lock` before model/mutation/pointer work;
unavailable revalidation is also fail-closed. Date-specific production-day and
capture outputs are placed under `<artifact-output>/<date>/`.

Each date receipt records the authoritative input digest, rebuild identity,
policy version, classification counts and limitations, fencing token, durable
job/artifact/publication identities, report and proof hashes, top/additional/
citation counts, quality gates, API visibility, prior publication identity, and
pointer-switch result. The aggregate receipt is machine-readable. Exit status
2 means at least one execution date is pending or unrebuildable; independent
dates still complete.
