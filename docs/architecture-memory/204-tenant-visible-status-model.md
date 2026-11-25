# 204. Tenant-Visible Status Model

## Status

Locked for product/UX baseline.

## Research Anchors

- RFC 9457 Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
- Google Cloud graceful degradation: https://docs.cloud.google.com/architecture/framework/reliability/graceful-degradation

## Decision

Users and admins need explicit status states for monitoring workflows. The product must not silently skip scans, summaries or deliveries.

## Status Families

Source binding:

```text
connected
validating
active
credential_attention_required
quota_limited
provider_degraded
policy_blocked
paused
deleted
```

Scan:

```text
scheduled
queued
running
completed
completed_partial
skipped_quota
skipped_policy
failed_retrying
failed_needs_attention
```

Summary/digest:

```text
pending
generating
ready
partial
delayed_budget
delayed_provider
failed_validation
failed_permanent
```

Delivery:

```text
queued
sent_to_provider
accepted
bounced
failed_retrying
failed_permanent
suppressed
dead_lettered
```

## Rules

- Every non-success status has reason code.
- UI maps reason codes to user-safe text and action.
- Admin view can include more detail than user view.
- Status changes are auditable for source/credential/billing-sensitive states.

## Best-Fact Choice

Monitoring products must be transparent about degraded states. Hidden skips create false trust and support pain.

