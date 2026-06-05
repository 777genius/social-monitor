# Iteration 05 / Phase 02 - Notifications And Digests

## Objective

Add digest and notification delivery semantics.

## Steps

1. Define notification preferences.
2. Define digest schedule and assembly policy.
3. Add digest generation job.
4. Add email/webhook placeholder adapters.
5. Add delivery attempt log.
6. Add retry/DLQ for delivery.
7. Add notification idempotency key strategy.
8. Add suppression policy for repeated failures or low-signal updates.
9. Add digest provenance: which summaries/feed items were included and why.

## Delivery Attempt States

| State | Meaning |
| --- | --- |
| `queued` | delivery work accepted |
| `assembling` | digest/notification content is being built from read models |
| `suppressed` | preference, low-signal or duplicate rule prevented delivery |
| `sending` | adapter/provider attempt in progress |
| `delivered` | provider accepted delivery |
| `failed_retryable` | retry may be attempted |
| `failed_terminal` | no further retry |
| `dead_lettered` | retry budget exhausted and support-visible |
| `cancelled` | tenant/user/preference/resource state changed before send |

State rules:

1. Re-check preferences, tenant status and resource state before `sending`.
2. `delivered` means provider accepted delivery, not that user read it.
3. `suppressed` is successful decision-making, not failure.
4. Duplicate jobs with same idempotency key return same user-visible outcome.

## Digest Assembly Rules

1. Assemble from Feed/Summary read models, not raw source/provider payloads.
2. Include source window, topic, summary ids and feed item ids for provenance.
3. No-signal digest is allowed only if user preference wants it; otherwise suppress.
4. Stale summaries are either marked stale or excluded according to preference.
5. Digest window is deterministic by tenant, user/channel, topic set and time window.
6. Delivery idempotency key includes tenant, recipient/channel, digest window and content hash.

## Digest Time Rules

1. Digest windows are calculated in UTC with a deterministic window id.
2. User timezone affects displayed/preferred delivery time, not the stored window identity.
3. Window boundaries are inclusive start and exclusive end unless contract says otherwise.
4. Duplicate digest jobs for the same window must produce the same idempotency key when content is unchanged.
5. DST transitions must not create duplicate or skipped digest windows.
6. Late-arriving summaries enter the next eligible window unless a documented grace period includes them.
7. Stale summaries are marked or suppressed before send according to preference.

## Edge Cases

- Digest has no relevant items.
- User disables notifications mid-job.
- Delivery provider returns 429.
- Webhook endpoint fails repeatedly.
- Same summary appears in multiple topics/digests.
- Digest generated from stale summary.
- Notification preference changes between assembly and delivery.
- Digest assembled, then topic is disabled before sending.
- Duplicate digest jobs run after scheduler retry.
- Email provider accepts send but callback/status update is delayed.
- User preference says high-signal only but all summaries are no-signal.
- User timezone changes between digest assembly and delivery.
- DST transition happens inside digest schedule.
- Summary completes just after digest window closes.
- Duplicate scheduler run attempts same digest window.

## Pay Attention

- Digest is derived from summary/feed truth.
- Delivery attempt log is not same as user receipt.
- Do not block summary persistence on delivery failure.
- Preferences must be checked before delivery, not only before enqueue.
- Idempotency key should include tenant, user/channel, digest window and content hash.
- Keep digest rendering deterministic enough for idempotency/content hash.
- Do not send sensitive raw source payloads in email/digest by default.
- Time-window identity must be stable enough for retries and support diagnosis.

## Acceptance Criteria

- Scheduled digest assembles.
- Delivery status is visible.
- Failed delivery retries then DLQs.
- Preferences are respected.
- Duplicate digest jobs do not duplicate user-visible notifications.
- Digest includes provenance and stale/no-signal handling.
- Delivery attempt state machine and idempotency keys are tested.
- Fake-clock tests cover timezone change, DST boundary and late summary behavior.
