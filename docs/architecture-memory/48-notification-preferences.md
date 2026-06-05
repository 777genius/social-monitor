# Notification Preferences

Date: 2026-05-31
Status: baseline notification preferences memory

## Decision

Notification preferences are product configuration, not delivery-provider settings.

Users and tenants need clear control over:

- what events notify;
- which channels notify;
- frequency/digest windows;
- quiet hours;
- severity thresholds;
- unsubscribe behavior.

## Preference Model

```text
notification_preferences
  tenant_id
  user_id
  channel
  event_type
  enabled
  frequency
  quiet_hours
  timezone
  min_priority
  digest_schedule_id nullable
```

Channels:

```text
in_app
email
webhook
telegram
push_later
```

## Delivery Rules

- user preferences apply before provider send;
- tenant-level safety settings can cap noisy notifications;
- compliance/security notifications may bypass some preferences where legally/operationally required;
- unsubscribe/suppression list is respected for marketing/non-critical email.

## Digest vs Alert

Use separate policies:

```text
digest: scheduled summary of relevant items
alert: event-driven high-priority notification
```

Do not spam alerts for normal feed changes.

## Locked Decisions

1. Preferences are product-owned.
2. Delivery providers do not own notification truth.
3. Digest and alert policies are separate.
4. Quiet hours/timezone are part of preferences.
5. Webhook notification behavior is tenant-controlled and bounded.

