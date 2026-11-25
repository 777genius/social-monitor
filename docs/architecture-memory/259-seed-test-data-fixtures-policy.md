# 259 - Seed Test Data And Fixtures Policy

## Decision

Use deterministic, privacy-safe seed data and redacted provider fixtures.

Never use production social content, production tenant records or real credentials as normal test fixtures.

## Sources

- OWASP Test Data guidance in ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Logging/Data Exposure guidance: https://cheatsheetseries.owasp.org/
- NIST SP 800-122 PII guide: https://csrc.nist.gov/pubs/sp/800/122/final

## Seed Types

Use separate seed categories:

- local demo seed
- unit test builders
- integration test seed
- E2E seed
- provider fixture payloads
- load-test synthetic data

Do not reuse one giant seed for every purpose.

## Demo Tenant

Local demo tenant should include:

- user
- tenant
- topics
- HN source binding
- RSS source binding
- sample scan policies
- normalized items
- summaries
- source health states

Data should be synthetic or from sources where fixture use is permitted.

## Provider Fixtures

Provider fixtures must be:

- redacted
- versioned
- small enough for review
- representative of edge cases
- tagged with source and capture date
- free of secrets/tokens

Fixtures should cover:

- missing fields
- deleted/removed content
- rate-limit responses
- auth failures
- malformed payloads
- pagination/cursor pages

## Synthetic Data

Synthetic data should include:

- multiple tenants
- cross-tenant collision attempts
- long text
- unusual unicode where relevant
- time zones
- duplicate URLs
- duplicate titles
- high-volume topic windows

## Privacy Rules

Forbidden in fixtures:

- real access tokens
- refresh tokens
- private messages
- private tenant names
- emails unless synthetic
- phone numbers unless synthetic
- raw production logs
- real user identifiers without explicit approved anonymization

## Determinism

Tests should use deterministic IDs/times where possible.

Use a fake clock and stable factories to make failures reproducible.

## Fixture Review

Every fixture addition requires:

- source
- purpose
- redaction check
- license/terms check where relevant
- size review

## Architecture Rule

Good fixtures encode provider reality without importing production risk.
