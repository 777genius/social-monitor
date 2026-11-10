# Reader summary model usage

When the durable reader summary capture has `DURABLE_READER_SUMMARY_EVIDENCE_PATH`,
the agent-runtime client appends one metadata-only JSON line per task attempt to
`<evidence path>.usage.jsonl`. Production's summary runner writes evidence under
`/var/lib/social-monitor/artifacts/rolling-summary` in its container. The
corresponding host directory is the pipeline's `artifacts/rolling-summary`
volume. The log includes the target date, run and request identifiers, stage,
model, effort, status, duration, and token counts when returned by the runtime.
It never includes prompts, outputs, account IDs or credentials. Missing usage
or cache counts are null, not zero. A failed log write is reported on stderr
but does not change the result of a model call.

To aggregate one or more retained logs from a checkout with dependencies:

```sh
npm run report:reader-summary-usage -- /path/to/*.usage.jsonl
```

The report groups by target date, stage, model and effort. It counts failed or
unreported attempts separately. `estimatedApiUsd` is an approximate standard
short-context API equivalent using the dated prices in the script; unknown
cache is treated as uncached and unknown prices or long contexts are counted
as unpriced. It is not a subscription invoice and excludes cache-write and
service-tier costs. Older runs cannot be reconstructed from this log, and
model usage never returned by a provider remains unavailable.
