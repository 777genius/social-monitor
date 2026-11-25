# 250 - Mobile Store Privacy And Release Policy

## Decision

Mobile release readiness includes privacy declarations, SDK inventory and store compliance checks.

App Store and Google Play disclosures must match real SDK behavior and product telemetry.

## Sources

- Apple App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- App Store Connect app privacy help: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Google Play Data safety form: https://support.google.com/googleplay/android-developer/answer/10787469
- Apple privacy manifests: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311

## Required Inventory

Before release, maintain:

- SDK list
- SDK purpose
- data collected
- data shared
- linked-to-user status
- tracking/ads status
- retention
- opt-out/consent behavior
- platform permissions

This inventory must include Firebase, analytics, crash reporting, auth SDKs, push SDKs and any future attribution SDK.

## Privacy Declaration Rule

Apple App Privacy and Google Play Data Safety entries must be generated from the internal data inventory and reviewed before each store submission.

Do not answer store forms manually from memory.

## Telemetry Alignment

If mobile collects:

- crash logs
- device identifiers
- push tokens
- analytics events
- usage data
- diagnostics

Then privacy policy, store labels and in-app settings must all match.

## Permission Minimization

Ask for permissions only when the user reaches a feature needing them.

V1 likely needs:

- notifications

Avoid unless explicitly needed:

- contacts
- location
- microphone
- camera
- photo library
- background location

## Release Gates

Each release candidate must pass:

- flavor/env check
- production API host check
- privacy inventory diff
- SDK inventory diff
- crash/analytics consent defaults check
- notification permission UX check
- token/log redaction check
- generated client freshness check
- store metadata review

## Version Compatibility

Mobile apps remain installed after backend deploys.

Backend must support old app versions through:

- API compatibility window
- minimum supported version policy
- forced upgrade only for security or breaking legal/compliance need

## Incident Response

If a store privacy declaration is wrong:

- stop affected release if possible
- correct declaration
- update privacy policy if needed
- assess user notification need
- document root cause
- update SDK/data inventory workflow

## Architecture Rule

Mobile privacy compliance is not a release checklist afterthought.

It is derived from telemetry, SDKs, storage and data-flow architecture.
