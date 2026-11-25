# 248 - Mobile Push Delivery UX Policy

## Decision

Push notifications are best-effort delivery signals, not canonical product state.

The mobile app uses FCM/APNs for alerts and wake-up hints, then hydrates truth from REST read models.

## Sources

- Firebase Cloud Messaging Flutter receive messages: https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages
- Firebase Cloud Messaging Flutter first message: https://firebase.google.com/docs/cloud-messaging/flutter/first-message
- Apple User Notifications: https://developer.apple.com/documentation/usernotifications
- Android notifications overview: https://developer.android.com/develop/ui/views/notifications

## App States

FCM behavior depends on:

- foreground
- background
- terminated

Firebase documents preconditions such as the app opening at least once and iOS requiring manual reopen after user force-quits/swipes away the app before background messages resume.

Therefore push is not a reliable job execution channel.

## Notification Types

Use push for:

- summary ready
- source attention required
- digest delivered
- scan failed repeatedly
- credential expired
- important tenant admin action

Do not use push for:

- every normalized item
- high-volume feed updates
- provider polling
- guaranteed delivery of audit data

## Token Lifecycle

Mobile registers push token with backend:

- user id
- tenant memberships snapshot/version
- platform
- app flavor
- app version
- locale/timezone
- last seen

Backend prunes stale/invalid tokens and respects notification preferences.

## Foreground UX

Foreground messages should not blindly show system banners.

Use in-app event handling:

- update notification badge
- refresh relevant store
- show subtle in-app toast only for high-value events

## Deep Link Policy

Notification payload contains only routing identifiers:

- topic id
- summary id
- source binding id
- event type

Payload must not contain raw source content, secrets or large summary text.

App opens route and fetches current state from API.

## Reliability

Backend records notification delivery attempt status separately from user-visible truth.

User-facing UI must not assume a notification was received.

## Privacy

Notification content may be visible on lock screen.

Default payload copy should avoid sensitive details unless tenant/user explicitly opts into rich notification previews.

## Architecture Rule

Push says "check the server".

REST read models say "what is true".
