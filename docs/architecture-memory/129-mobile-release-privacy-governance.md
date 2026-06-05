# 129. Mobile Release and Privacy Governance

## Status

Locked for Flutter/mobile baseline.

## Research Anchors

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple privacy labels: https://www.apple.com/privacy/labels/
- Google Play Data safety section: https://support.google.com/googleplay/android-developer/answer/10787469
- Flutter release documentation: https://docs.flutter.dev/deployment

## Decision

Mobile releases need privacy inventory, generated-client compatibility and staged rollout controls. Store disclosures must be treated as release artifacts.

## Release Channels

Use:

- internal/dev builds;
- closed beta/TestFlight;
- staged production rollout;
- emergency hotfix path.

Each release records:

- backend API compatibility;
- generated client version;
- feature flag assumptions;
- privacy/data collection changes;
- analytics events added/removed;
- source credential flow changes.

## Privacy Inventory

Before store submission, map app behavior to:

- Apple privacy labels;
- Google Play Data safety;
- in-app privacy policy;
- backend data classification docs.

Any new SDK, analytics event, crash reporter, notification channel or credential flow can change disclosures.

## App Review Readiness

Keep test credentials/demo environment ready for app review. Source providers requiring OAuth should have review-safe demo paths and clear explanations.

## Best-Fact Choice

Mobile privacy disclosures lag code unless they are part of release governance. Treat App Store/Google Play forms as compliance outputs generated from the data inventory.

