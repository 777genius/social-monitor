# Frontend Observability Provider Decision

## Decision

Use a provider-neutral frontend observability facade now.
Plan Sentry as the first likely production crash/error/performance adapter after privacy review.
Use OpenTelemetry naming and correlation concepts, but do not add a direct Flutter OTel SDK until the Dart/Flutter ecosystem is mature enough for this product.
Use the backend/custom API for product events, audit events and privacy-controlled analytics, not for crash collection by default.

Research anchors:

- Sentry Flutter SDK: https://docs.sentry.io/platforms/dart/guides/flutter/
- Sentry Flutter usage: https://docs.sentry.io/platforms/dart/guides/flutter/usage/
- OpenTelemetry registry: https://opentelemetry.io/ecosystem/registry/
- OpenTelemetry logs data model: https://opentelemetry.io/docs/specs/otel/logs/data-model/
- Project trace correlation: `../../../docs/architecture-memory/298-trace-correlation-context-policy.md`
- Mobile crash privacy: `../../../docs/architecture-memory/218-mobile-crash-analytics-privacy.md`

## Why

The frontend needs:

- uncaught error reporting;
- non-fatal workflow failure reporting;
- route/screen/action context;
- backend trace correlation;
- release/build attribution;
- feature flag snapshot attribution;
- strict payload redaction.

It must avoid:

- SDK lock-in inside features;
- raw social payload logging;
- accidental analytics collection before consent;
- provider credentials or source payloads in diagnostics.

## Provider Options

Sentry:

- strong Flutter support for error reporting and performance;
- good first adapter for crash and non-fatal errors;
- must be privacy-reviewed before adding dependency.

OpenTelemetry direct Flutter SDK:

- good long-term semantic direction;
- use concepts and trace ids now;
- defer direct SDK until package maturity and mobile/web support are proven.

Custom backend only:

- good for product/audit events;
- weak as the only crash/error monitoring system;
- avoid unless privacy or procurement blocks external provider.

## Facade Contract

The app shell should eventually expose:

```text
FrontendObservability
  recordNonFatal(failure, trace, fields)
  recordUnhandled(error, stack, trace, fields)
  trackAction(actionId, trace, fields)
  setUserPseudonym(userId)
  setWorkspacePseudonym(workspaceId)
  setConsent(consentState)
  setFeatureSnapshot(snapshotId)
```

Feature stores depend on the facade or an application contract, never on Sentry, Firebase, OTel or HTTP logging directly.

## Required Context

Every report includes:

- correlation id;
- screen id;
- optional action id;
- route id;
- release version/build;
- feature flag snapshot id when available;
- workspace pseudonym when allowed;
- high-level failure category.

Every report excludes:

- raw social post text;
- author handles;
- source credentials;
- API keys;
- raw provider payloads;
- exact query text unless classified and approved;
- URLs with sensitive query params.

## Sampling And Environments

Development:

- console/dev sink is allowed;
- external provider optional;
- no real credentials or raw user payloads.

Staging:

- external error reporting allowed for internal users;
- sampling can be higher;
- payload redaction must match production.

Production:

- crash/error reporting enabled only through approved provider and privacy settings;
- analytics disabled until event catalog and consent are wired;
- regulated tenants can disable analytics by policy.

## Implementation Gate

Before adding an observability SDK:

- check current stable package version and maintenance state;
- add facade and adapter, not direct feature imports;
- add redaction tests;
- update privacy docs;
- update app store disclosure checklist if mobile release is affected;
- run frontend architecture tests.

