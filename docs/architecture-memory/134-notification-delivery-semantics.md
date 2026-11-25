# 134. Notification Delivery Semantics

## Status

Locked for delivery baseline.

## Research Anchors

- Firebase Cloud Messaging message handling and priority: https://firebase.google.com/docs/cloud-messaging/concept-options
- Apple Push Notification service provider API: https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server
- Web Push RFC 8030: https://www.rfc-editor.org/rfc/rfc8030
- SendGrid email deliverability guide: https://docs.sendgrid.com/ui/sending-email/deliverability

## Decision

Notification delivery is at-least-once internally and best-effort externally. User-visible delivery state must be explicit.

## Channel Semantics

| Channel | Semantics | Notes |
|---|---|---|
| email | accepted/sent/bounced/complained where provider reports | deliverability reputation matters |
| mobile push | accepted by APNs/FCM, not guaranteed displayed | TTL and priority matter |
| web push | accepted by push service, endpoint may expire | handle gone/expired subscriptions |
| webhook | signed delivery with retries and logs | tenant endpoint reliability varies |
| in-app | durable notification record | strongest user-visible guarantee |

## Delivery State

```text
queued
reserved
sent_to_provider
delivered_or_accepted
bounced
failed_retryable
failed_permanent
dead_lettered
suppressed
```

Do not claim "delivered" unless the provider gives that signal. Usually the correct state is "accepted by provider".

## Retry Policy

- transient provider/network errors retry with exponential backoff;
- permanent errors stop and record reason;
- webhook endpoints get max delivery window and DLQ;
- push tokens that expire are disabled;
- email complaints suppress future marketing/non-critical mail.

## Best-Fact Choice

Notification systems must distinguish internal job success from external user delivery. Conflating them creates false reliability metrics and bad support tooling.

