# 126. Feature Flags and Experiments

## Status

Locked for product/platform baseline.

## Research Anchors

- OpenFeature introduction: https://openfeature.dev/docs/reference/intro
- OpenFeature evaluation context: https://openfeature.dev/specification/sections/evaluation-context/
- OpenFeature providers: https://openfeature.dev/docs/reference/concepts/provider
- LaunchDarkly flag creation practices: https://launchdarkly.com/docs/guides/flags/creating-flags

## Decision

Use a vendor-neutral feature flag abstraction compatible with OpenFeature concepts. Feature flags are operational controls, not a replacement for authorization, entitlements or migrations.

## Flag Classes

| Class | Examples | Expiry Required |
|---|---|---|
| release flag | new summary UI, new connector flow | yes |
| ops kill switch | disable X adapter, pause AI summaries | no, reviewed |
| experiment flag | ranking variant, digest template | yes |
| entitlement flag | beta feature access | yes or plan-bound |
| migration flag | read from new projection | yes |

## Rules

- Every non-permanent flag has owner and removal date.
- Flag keys are stable and namespaced: `source.reddit.new_oauth_flow`.
- Evaluation context can include tenant plan, source kind and environment.
- Do not include raw user identifiers in analytics unless privacy policy allows.
- Security/compliance checks cannot be bypassed by feature flags.
- Kill switches must fail closed and be available without app redeploy.

## Experiments

Experiments are allowed only for product behavior, not compliance obligations. Summary/ranking experiments must be recorded with model/prompt/rules version so outputs remain explainable.

## Best-Fact Choice

Use OpenFeature-compatible abstraction even if the first provider is local/config-based. This avoids binding the architecture to one commercial flag vendor.

