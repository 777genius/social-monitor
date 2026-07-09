# GitHub Repo Radar Provider

Provider key: `github-repo-radar`

Repo Radar discovers repository trend signals from GH Archive and verifies
repository metadata through GitHub REST where needed. Full live mode needs a
Google Cloud project for BigQuery access.

References:

- [GH Archive](https://www.gharchive.org/)
- [GH Archive BigQuery README](https://github.com/igrigorik/gharchive.org/blob/master/bigquery/README.md)
- [GitHub REST API rate limits](https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## Local Setup

Fixture checks do not require Google Cloud:

```sh
npm run check:github-repo-radar-smoke
```

Full live evidence requires a real Postgres URL and BigQuery access:

```sh
export GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID=<gcp-project-id>
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json
export DATABASE_URL=postgresql://...

SOURCE_LIVE_ENVIRONMENT_ID=<non-local-env-id> \
BACKEND_IMAGE_DIGEST=<image-digest> \
BACKEND_GIT_COMMIT_SHA=<40-char-sha> \
SOURCE_LIVE_OPERATOR=<operator> \
npm run capture:live-github-repo-radar
```

## Runtime Env

- `GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID`: required for BigQuery live mode.
- `GITHUB_REPO_RADAR_BIGQUERY_LOCATION`: optional BigQuery location.
- `GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES_BILLED`: recommended cost guard.
- `GITHUB_REPO_RADAR_BIGQUERY_TIMEOUT_MS`: optional client timeout.
- `GITHUB_REPO_RADAR_BIGQUERY_JOB_TIMEOUT_MS`: optional BigQuery job timeout.
- `GOOGLE_APPLICATION_CREDENTIALS`: standard Google credential file path, if
  not using another Application Default Credentials path.

## Supported Config

- `mode`: must be `search` when provided.
- `query` or `term`: search term.
- `topics`: topic array alternative to `query`.
- `languages`: language array alternative to `query`.
- `windows`: any of `24h`, `48h`, `7d`, `30d`, `90d`.
- `maxItems`: integer from 1 to 100.
- `maxCandidates`: integer from 1 to 300.
- `minStars`: integer from 0 to 1000000.

At least one of `query`, `term`, `topics` or `languages` is required.

## Example Binding

```json
{
  "providerKey": "github-repo-radar",
  "config": {
    "topics": ["ai-agent", "developer-tools"],
    "languages": ["TypeScript", "Python"],
    "windows": ["24h", "7d"],
    "minStars": 100,
    "maxItems": 25
  }
}
```

## Operational Notes

- Configure `maximumBytesBilled` before long live windows. BigQuery can spend
  money even against public datasets.
- GitHub REST unauthenticated calls have a low limit. GitHub documents 60 REST
  requests/hour unauthenticated and higher limits for authenticated calls.
- Raw BigQuery rows are not retained by default; store normalized trend
  metadata only.

