# Iteration 05 - Test Fixtures And Scenarios

## Purpose
Define realtime fixtures that prove authorization, delivery, resync and notification idempotency.

## Core Fixtures
- Authenticated user in tenant A.
- Authenticated user in tenant B.
- Scan started, scan failed, feed updated and summary ready events.
- Duplicate event with same idempotency key.
- Missed events during disconnected session.
- Out-of-order status events.
- Expired replay cursor.
- Digest with no-signal, stale and high-signal summaries.
- Delivery attempt retry and DLQ states.
- Webhook payload with signature, key id, timestamp and delivery id.
- Fake clock with digest window boundary, DST transition and replay cutoff samples.

## Happy Path Scenarios
- User subscribes to authorized topic channel.
- Scan event updates mobile state.
- Summary-ready event creates notification.
- Reconnect triggers resync and restores state.
- Digest assembles from summaries/feed items with provenance.
- Webhook signature verifies with active secret.

## Negative Scenarios
- User subscribes to another tenant's channel.
- Token expires during WebSocket session.
- Duplicate event arrives.
- Notification write fails.
- Replay cursor belongs to another workspace.
- Webhook timestamp is outside replay window.
- API key scope is insufficient for requested endpoint.
- Preference disables queued delivery before send.
- Tenant membership revoked while WS connection is open.
- Webhook endpoint quarantined while retry is pending.
- Summary superseded after digest assembled and before send.
- Replay cursor is older than configured retention and returns `resync_required`.
- Digest job retries with the same UTC window and unchanged content hash.
- Webhook signature timestamp is valid but near the tolerance boundary.

## Edge Cases
- Event arrives while snapshot is loading.
- Access is revoked while connection is open.
- Mobile switches topic during event stream.
- Network flaps repeatedly during scan.
- Slow client cannot consume event burst.
- Digest content hash changes after summary becomes stale.
- Webhook secret rotates during retry.
- External provider accepts delivery but local status update fails.
- Notification preference changes after delivery attempt enters queued state.
- User timezone changes after digest assembly but before delivery.
- DST creates duplicate local hour and digest window still has one UTC identity.
- Summary completes exactly at digest window end and moves to next window.
- Mobile reconnects with stale cursor while newer REST snapshot exists.

## Regression Seeds
- WebSocket auth test cases.
- Reconnect/resync sequence.
- Notification idempotency fixture.
- Delivery attempt state transition fixture.
- Digest provenance fixture.
- Webhook signing/replay fixture.
- Temporal delivery fixture pack: digest boundary, timezone change, DST, replay expiry and webhook skew.
