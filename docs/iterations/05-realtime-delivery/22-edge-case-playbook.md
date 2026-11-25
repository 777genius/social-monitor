# Iteration 05 - Edge Case Playbook

## Scenario - Mobile Misses Events While Offline

- Signal: Reconnected app shows stale scan/summary status.
- Validate: Disconnect during events, reconnect later.
- Mitigation: Resync latest state through REST snapshot.

## Scenario - Duplicate Notification

- Signal: Same summary/feed event creates multiple notifications.
- Validate: Replay same event twice.
- Mitigation: Idempotency key from source event ID and notification type.

## Scenario - User Loses Access While Connected

- Signal: WebSocket still receives workspace events after permission removal.
- Validate: Revoke role during connection.
- Mitigation: Reauthorize on event publish or force channel disconnect.

## Scenario - Webhook Failure Storm

- Signal: External endpoint returns repeated 500s.
- Validate: Failing webhook fixture.
- Mitigation: Backoff, retry budget and visible delivery log.

## Scenario - Replay Cursor Too Old

- Signal: client reconnects but cannot recover missed events from replay window.
- Validate: reconnect with expired cursor.
- Mitigation: return explicit `resync_required` and force REST snapshot refresh.

## Scenario - Out-Of-Order Summary Event

- Signal: mobile sees summary completed before summary list/detail exists locally.
- Validate: deliver completed event before REST list load.
- Mitigation: treat WS as hint and refresh summary REST snapshot before rendering completed state.

## Scenario - Slow Client Backpressure

- Signal: WS gateway buffers grow for one client and threaten service memory.
- Validate: client stops reading during event burst.
- Mitigation: apply per-connection buffer limits, send degraded/disconnect signal and require REST resync.

## Scenario - Digest Stale Before Delivery

- Signal: digest assembled from summary that becomes stale before sending.
- Validate: assemble digest, add new feed evidence, then deliver.
- Mitigation: re-check summary freshness before send and mark stale or suppress according to preference.

## Scenario - Preference Changes Mid-Delivery

- Signal: user disables notifications but queued delivery still sends.
- Validate: disable preference after job queued and before adapter send.
- Mitigation: re-check preferences immediately before `sending` state.

## Scenario - Delivery Accepted But Local Status Fails

- Signal: provider accepted email/webhook but local attempt remains retryable.
- Validate: adapter returns success and DB update fails.
- Mitigation: use idempotency key, retry status reconciliation and avoid duplicate user-visible delivery where possible.

## Scenario - Webhook Replay Attack

- Signal: old signed payload is resent to receiver or support test endpoint.
- Validate: duplicate delivery id/timestamp outside replay window.
- Mitigation: include timestamp, delivery id and idempotency key in signed payload; receiver docs require replay cache.
