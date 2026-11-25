# 217 - Flutter Build Flavors And Environment Config

## Decision

The mobile app uses explicit Flutter flavors for local, development, staging and production.

Runtime environment is selected by build artifact, not by a user-editable runtime toggle.

## Sources

- Flutter flavors guide: https://docs.flutter.dev/deployment/flavors
- Flutter build and release docs: https://docs.flutter.dev/deployment
- Android product flavors: https://developer.android.com/build/build-variants
- Apple bundle identifier guidance: https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleidentifier

## Flavor Matrix

```text
local       -> local API / local push disabled / debug signing
development -> dev API / dev Firebase project / internal only
staging     -> staging API / staging Firebase project / TestFlight/internal
production  -> prod API / prod Firebase project / stores
```

Each flavor has:

- separate app name suffix where useful
- separate bundle id / application id
- separate Firebase project
- separate API base URL
- separate WebSocket base URL
- separate OpenAPI client environment config
- separate crash/analytics collection defaults

## Configuration Boundary

Allowed build-time config:

- API URL
- WebSocket URL
- OAuth redirect scheme
- Firebase app id
- app display name
- feature flag environment key
- log level default

Forbidden in mobile bundle:

- backend secrets
- service credentials
- provider API secrets
- signing secrets
- internal admin tokens

## Clean Architecture Impact

Environment config is an infrastructure adapter.

Feature/domain layers must not read:

- `const String.fromEnvironment`
- platform channel config
- Firebase options
- `.env` values

Instead:

```text
EnvConfigPort -> EnvConfigAdapter -> composition root
```

Presentation stores receive use cases already wired for the selected environment.

## Generated Clients

OpenAPI client generation must be environment-agnostic. Base URL and auth provider are injected.

Generated code must not contain:

- hardcoded tenant ids
- hardcoded API hostnames
- hardcoded auth tokens

## Release Safety

Production builds require:

- production bundle id
- production Firebase options
- production API host allowlist
- release signing
- crash/analytics defaults reviewed
- debug menu disabled unless protected by internal entitlement

## Local Developer Flow

Local flavor may point to:

- `10.0.2.2` for Android emulator
- localhost tunnel or LAN host for physical devices
- local mock server for contract tests

Local flavor must be visually distinct in app chrome to prevent accidental screenshots or testing against the wrong backend.

## CI Gates

CI must build at least:

- Android development debug
- Android production release dry run
- iOS staging archive dry run where runners support it

CI must reject:

- production app id with non-production API URL
- non-production app id with production API URL
- missing Firebase options for a shipped flavor
- debug flags in production build

## Operational Rule

When an incident affects staging or production, the affected mobile flavor must be visible in logs, crash reports and API request metadata.
