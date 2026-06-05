# 147. Connector Version Lifecycle

## Status

Locked for source platform baseline.

## Research Anchors

- Semantic Versioning: https://semver.org/
- Reddit Developer Terms: https://redditinc.com/policies/developer-terms
- CloudEvents specification: https://github.com/cloudevents/spec

## Decision

Source adapters have explicit versions, rollout states and compatibility promises. A connector is product infrastructure, not a one-off integration.

## Versioning

Each connector has:

- adapter package version;
- provider policy version;
- normalization schema version;
- credential flow version;
- capability schema version;
- test fixture version.

Use SemVer for adapter packages. Use explicit policy/schema versions for behavior that affects stored data or user promises.

## Lifecycle States

```text
experimental
beta
stable
deprecated
disabled
removed
```

Rollout:

- fake adapter passes contract suite;
- real adapter passes sandbox/manual tests;
- limited tenant allowlist;
- beta with kill switch;
- stable after reliability/cost evidence.

## Compatibility

Breaking connector changes require:

- migration plan for source bindings/cursors;
- re-normalization or dual-read strategy where needed;
- user/admin communication if behavior changes;
- policy metadata update;
- rollback plan.

## Best-Fact Choice

Connector changes can change data meaning. Version adapter behavior and normalization explicitly so old summaries, evals and support tickets remain explainable.

