# Feature status

[Back to README](../../README.md)

Reviewed against `main` on September 14, 2026. This is an implementation map;
provider availability still depends on the deployed configuration and credentials.

| Area | Implemented today | Reference |
| --- | --- | --- |
| Collection | Topic interests, source bindings, scan jobs, normalized feed items and persistent worker pipelines | [Providers](../providers/README.md), [ingestion](../../libs/ingestion) |
| Reader summaries | Daily summaries, rolling four-hour updates, citations, coverage and ranked top reads | [Summary workflows](../../libs/summary/features), [reader UI](../../apps/frontend/features/summaries/lib/src/presentation) |
| Reading experience | Compact post summaries, original-text toggle, post ratings and published summary pages | [Summary frontend](../../apps/frontend/features/summaries) |
| Weekly digests | Evidence-bound weekly artifacts, editorial validation and certified publication workflow | [Weekly publication](../../libs/summary/features/publish-reader-summary-weekly-certified-artifact) |
| Personalization | Interest profiles, relevance feedback, post ratings, ranking and personalized digest assembly | [Relevance workflows](../../libs/relevance/features) |
| Delivery | Delivery service and signed HTTP webhook integration | [Delivery service](../../apps/delivery-service), [delivery context](../../libs/delivery) |
| Connected frontend | Flutter app, generated REST client, feature modules and responsive design system; demo entrypoint also available | [Frontend playbooks](../../apps/frontend/docs/README.md) |
| Operations | PostgreSQL persistence, broker-backed workers, event relay, production deployment workflows and recovery tooling | [Local setup](getting-started.md), [deployment workflow](../../.github/workflows/production-deploy.yml) |

## Source availability

- **Hacker News, RSS/Atom and GitHub Trending:** beta implementations; no account or API key required. RSS needs a public feed URL.
- **GitHub Repo Radar:** beta implementation; full live mode requires Google Cloud BigQuery.
- **Reddit:** beta implementation; real collection requires OAuth credentials.
- **X/Twitter:** implemented through the private `x-collector`, including daily collection and metric renewal. Requires collector configuration and dedicated research accounts.
- **GitHub Issues:** manual-only; explicitly gated in beta.
- **Telegram:** deferred; no bindable runtime provider.

See the [provider matrix and setup guides](../providers/README.md) before enabling a source.

## Scope of the status

The connected reader, collection, ranking and publishing code goes beyond a demo
shell. Existing tests and deployment workflows are part of the repository, but
this documentation update does not certify every provider or feature as live in
every environment. Weekly pipeline implementation is not a claim that weekly
publication is enabled for every workspace. Monthly delivery is not advertised
as verified functionality here.

Use the [development reference](development.md) for checks and architecture,
and the [getting-started guide](getting-started.md) to run a connected workspace.
