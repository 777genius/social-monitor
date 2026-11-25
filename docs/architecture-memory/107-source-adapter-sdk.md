# 107. Source Adapter SDK

## Status

Locked for implementation blueprint.

## Research Anchors

- NestJS modules: https://docs.nestjs.com/modules
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/

## Decision

Every social/news source is implemented through one Source Adapter SDK. Core ingestion never talks directly to Reddit, X, Telegram, HN or RSS libraries.

## Interface

```ts
export interface SourceAdapter {
  readonly kind: SourceKind;
  discoverCapabilities(): Promise<SourceCapabilities>;
  validateCredentials(input: CredentialRef): Promise<CredentialValidationResult>;
  estimateCost(policy: ScanPolicy): Promise<CostEstimate>;
  getQuotaState(binding: SourceBindingRef): Promise<QuotaState>;
  fetchIncremental(input: IncrementalFetchInput): Promise<FetchBatch>;
  fetchBackfill(input: BackfillFetchInput): Promise<FetchBatch>;
  normalize(raw: RawPayloadRef): Promise<NormalizedSourceItem[]>;
}
```

## Required Adapter Artifacts

Each adapter package must include:

- deterministic fake adapter;
- contract fixtures;
- policy file with quotas/terms notes;
- normalization tests;
- provider error mapping tests;
- cost estimate tests;
- sample credentials validation result;
- docs for required provider setup.

## Provider-Neutral Errors

Adapters return stable errors:

- `unauthorized`;
- `forbidden_by_policy`;
- `quota_exhausted`;
- `temporarily_unavailable`;
- `content_unavailable`;
- `malformed_query`;
- `cursor_expired`;
- `provider_contract_changed`;
- `cost_limit_exceeded`.

## Security Rules

- Adapters receive credential references, not raw secrets, unless inside the credential access boundary.
- Adapters never log raw payloads, tokens or private user identifiers.
- User-provided URLs are validated through SSRF-safe URL utilities before fetching.
- No adapter may implement anti-bot bypass, CAPTCHA evasion or browser stealth as a core strategy.

## Best-Fact Choice

The adapter SDK is the main protection against source lock-in. It must include cost, quota and policy semantics, not only `fetch()`.

