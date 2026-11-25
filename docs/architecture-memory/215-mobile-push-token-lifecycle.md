# 215. Mobile Push Token Lifecycle

## Status

Locked for notification/mobile baseline.

## Research Anchors

- FCM registration token management: https://firebase.google.com/docs/cloud-messaging/manage-tokens
- FCM iOS setup/APNs token mapping: https://firebase.google.com/docs/cloud-messaging/get-started?platform=ios
- APNs remote notification server setup: https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server

## Decision

Push tokens are per app/device/session delivery addresses, not user identity. Track freshness and prune stale/invalid tokens to keep delivery metrics accurate.

## Token Record

Fields:

- token id;
- user id;
- tenant ids allowed;
- platform;
- app version;
- device fingerprint hash optional;
- push provider;
- token value encrypted or protected;
- created at;
- last refreshed at;
- last successful send;
- invalidated at/reason.

## Rules

- Client sends token on login and token refresh.
- Server associates token with user/session, not only device.
- Remove token on logout where possible.
- Disable tokens rejected as invalid/unregistered by provider.
- Periodically prune stale tokens.
- Do not use push token as authentication.
- Notification preferences still gate sends.

## Best-Fact Choice

Push tokens rot over time. Without lifecycle management, delivery metrics become misleading and notification jobs waste provider/API capacity.

