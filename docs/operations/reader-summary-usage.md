# Reader summary model usage

The summary runner takes its non-secret model selection from
`ops/deploy/production-runtime/reader-summary-model.env`. Load this file after
the runner's general environment so it overrides the transport and model there.
`AGENT_RUNTIME_GATEWAY_LLM_MODEL` is the single model setting: the Codex gateway
route derives the allowed effort for it (currently `gpt-6.1-terra` / `medium`).
Remove old `AGENT_RUNTIME_READER_SUMMARY_MODEL`,
`AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT`, and
`AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT` overrides from the runner's general
environment. Keep gateway origins, policy and account references in the
environment-specific configuration, and mount its control token and CA as
separate protected files. Loading this model file alone does not connect the
runner to the gateway or deploy a new image.

The Hetzner V3 intelligence worker loads the same file using
`ops/deploy/production-runtime/compose.jev-summary-model.yml`. Install the model
file at the absolute path named by that overlay and include the overlay when
recreating the worker. Change the repository file and reinstall it to change
the worker's summary model; recreate the worker to apply the new setting.
Compose `environment` entries override `env_file`, so remove conflicting
model and effort entries from other overlays.
Jev reader-value scoring uses its own model configuration. The worker's legacy
source-content reviewer shares the summary gateway setting, even though the
normal V3 summary path uses Jev assessments. The separate legacy daily runner
does not yet load this file and retains its own model configuration.

For a controlled worker update without running summary jobs, set
`INTELLIGENCE_SUMMARY_EXECUTION_PAUSED=true` on the intelligence worker.
Its summary pollers and queue drains do not claim work while paused; queued
messages and requested jobs remain available. The periodic scheduler can still
create requests, and other services or manual summary commands are not paused.
Set the value to `false` and restart the worker when summary execution may
resume. This setting does not pause collection or Jev scoring.

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
The V3 intelligence worker does not currently set this evidence path, so these
capture logs do not account for its summary tasks.

To aggregate one or more retained logs from a checkout with dependencies:

```sh
npm run report:reader-summary-usage -- /path/to/*.usage.jsonl
```

The report groups by target date, stage, model and effort. It counts calls and
those with unreported usage. `estimatedApiUsd` is an approximate standard
short-context API equivalent using the dated prices in the script; unknown
cache is treated as uncached and unknown prices or long contexts are counted
as unpriced. It is not a subscription invoice and excludes cache-write and
service-tier costs. Older runs cannot be reconstructed from this log, and
model usage never returned by a provider remains unavailable.
