# 218 - Mobile Crash And Analytics Privacy

## Decision

Mobile crash reporting and analytics are privacy-controlled telemetry, not unrestricted product data collection.

Crashlytics can be used for stability. Analytics can be used for product quality and funnel measurement only after explicit event governance.

## Sources

- Firebase Crashlytics Flutter customization: https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports
- Firebase Crashlytics Flutter get started: https://firebase.google.com/docs/crashlytics/flutter/get-started
- Google Analytics for Firebase data collection controls: https://firebase.google.com/docs/analytics/configure-data-collection
- Firebase privacy and security: https://firebase.google.com/support/privacy
- Apple privacy manifests: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
- Google Play data safety: https://support.google.com/googleplay/android-developer/answer/10787469

## Collection Defaults

Production:

- Crashlytics allowed, but user identifiers are pseudonymous.
- Analytics disabled until consent and product policy are wired.
- Ad personalization is not used.

Development/staging:

- Crashlytics allowed for internal testers.
- Analytics may be disabled by default to avoid polluting product data.

Regulated tenants may disable mobile analytics entirely by entitlement/policy.

## Crashlytics Rules

Firebase documents that Crashlytics can disable automatic collection and enable collection at runtime. The app must support that path.

Required:

- native collection flag defaults per flavor
- runtime privacy preference bridge
- no raw email/user name in crash user id
- no raw source credentials in logs
- no post bodies or summary prompts in custom keys/logs
- clear separation between fatal and non-fatal recording

## Analytics Event Rules

Every analytics event needs an entry in an event catalog:

- event name
- owner
- purpose
- properties
- data class
- retention
- consent basis
- dashboards using it

No free-form event names from feature code.

## Allowed Event Examples

```text
source_connect_started
source_connect_completed
topic_created
scan_policy_updated
summary_opened
digest_delivery_setting_changed
```

## Forbidden Event Payloads

Do not send:

- raw social post text
- author handles
- source access tokens
- exact search query text unless classified and approved
- raw summary instructions
- URLs containing sensitive parameters
- tenant names where pseudonymous tenant ids are enough

## Architecture Boundary

```text
TelemetryPort
  recordCrashContext(...)
  recordNonFatal(...)
  trackEvent(...)
  setConsent(...)
  setUserPseudonym(...)
```

Feature stores depend on `TelemetryPort`, not Firebase SDKs.

Firebase is one adapter and can be replaced.

## Consent And Revocation

Consent state is stored locally and synced to backend privacy preferences.

Revocation must:

- stop future analytics collection
- clear local analytics identity where SDK supports it
- stop setting user identifiers in crash reports
- record backend audit event for preference change

## Debugging

Crash diagnostics should prefer:

- release version
- build number
- feature flag snapshot id
- route name
- source connector type
- high-level error category

Crash diagnostics must avoid content payloads.

## Store Disclosure

Apple App Store and Google Play privacy declarations must match actual SDK behavior and event catalog.

Any new telemetry SDK or event class requires privacy review before release.
