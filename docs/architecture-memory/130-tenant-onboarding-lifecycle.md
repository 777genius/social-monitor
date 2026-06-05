# 130. Tenant Onboarding Lifecycle

## Status

Locked for product/platform baseline.

## Research Anchors

- OpenFeature evaluation context: https://openfeature.dev/specification/sections/evaluation-context/
- NIST Digital Identity Guidelines: https://www.nist.gov/identity-access-management/nist-special-publication-800-63-digital-identity-guidelines

## Decision

Tenant onboarding is a lifecycle with explicit states, not just account creation.

## Tenant States

```text
created
profile_incomplete
trial_active
source_setup_required
active
payment_required
suspended
deleting
deleted
```

## Activation Checklist

A tenant becomes `active` when:

- owner identity verified enough for plan risk;
- terms/privacy accepted;
- at least one topic exists;
- at least one source binding is configured or intentionally skipped;
- scan policy is valid under plan;
- notification preference is set or skipped;
- usage/entitlement records initialized.

## Source Onboarding

Each source setup records:

- capability summary;
- required credentials/scopes;
- expected delay/freshness;
- quota/cost implications;
- provider policy notes;
- failure states users can understand.

## Trial Limits

Trial tenants get hard machine-readable limits:

- small topic count;
- conservative scan frequency;
- low daily AI budget;
- no large backfills;
- limited retention;
- restricted external webhooks/API keys.

## Best-Fact Choice

Good onboarding reduces support and protects cost. A tenant should not enter full scheduling/AI pipelines until required plan, source and preference state is valid.

