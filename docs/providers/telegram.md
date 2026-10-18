# Telegram public channel previews

Provider key: `telegram`. Anonymous HTTPS public-channel previews, starting at
`https://t.me/s/<channel>` with bounded fallback to official Telegram domains;
no Telegram account, bot, token, channel membership or extra container is needed.
The provider is implemented and fixture-certified. Deployment-scoped live evidence
remains required before external beta approval.

## Add a source

In Sources, choose Telegram and enter `@channel`, `channel`,
`https://t.me/channel` or `https://t.me/s/channel`. The UI normalizes the username.
Each channel has its own source binding, scan history and checkpoint. You can add
several channels to the same interest; username and URL aliases of the same
channel reuse its existing binding. The source binding API accepts:

```json
{
  "providerKey": "telegram",
  "config": {
    "mode": "account_feed",
    "channel": "telegram",
    "maxItems": 50,
    "maxPages": 5,
    "maxItemAgeHours": 24
  }
}
```

`mode: "url"` with `query` or `url` is also supported. All channel inputs must
identify the same public channel. Private invite links, post URLs, foreign hosts,
credentials and Bot/MTProto configuration are rejected.

Run the existing Docker app profile and request a scan through the normal source
binding workflow described in the [provider setup guide](README.md). Telegram adds
no environment variables, credentials, migrations, services or dependencies.
Collection belongs to the tenant/workspace source binding; this does not introduce
a separate Telegram session or collector for each user.

## Official-domain fallback

Each page tries the fixed HTTPS host list `t.me`, `telegram.me`, then
`telegram.dog`. These aliases are documented by [Telegram](https://core.telegram.org/api/links).
The channel and `before` boundary stay identical on every attempt; changing the
transport host does not reset a cursor or create a different post identity.
Binding inputs and canonical post URLs continue to use the documented `t.me`
format. Alternate hosts are an internal transport policy, not a configurable proxy.

Fallback applies only to transport failures and HTTP 5xx responses. HTTP 429
stops the page immediately and retains the existing rate-limit/backoff behavior;
another domain is never used to bypass that pause. HTTP 4xx, unavailable or
malformed preview HTML, unsafe DNS/connection results and redirects also stop
without switching hosts. All attempts share one page timeout budget and use
the guarded HTTP client, bounded bodies and no cookies or authorization.
Successful fallback produces an endpoint warning without marking otherwise
complete content as partial.

These domains may share Telegram infrastructure. Fallback can help with a
domain-specific DNS or network problem; it cannot guarantee availability during
a shared Telegram outage or reveal content missing from public previews.

## Checkpoint and catch-up

The existing scan cursor repository persists a versioned channel-bound cursor.
The first scan covers the latest 24 hours by default. `maxItemAgeHours` sets this
initial lookback (1–8760 hours), not an incremental cut-off: subsequent live scans
catch up after the last completed ID even after a longer outage.

A scan processes up to `maxItems` (1–500) and `maxPages` (1–20). When either budget
is exhausted, it saves the next older-page boundary and the original range ceiling.
Later scans finish that range before advancing the main watermark, then collect
posts that arrived during backfill. Missing/deleted numerical IDs do not require
one HTTP request per ID. Post identities are `channel/messageId`; canonical URLs
always point to the Telegram post, while outgoing links remain in its text/metadata.

A later-page failure saves successful work and the pending range. HTTP 429 keeps
its Retry-After backoff in the cursor. An inaccessible latest page fails the scan instead of reporting an empty healthy
channel. A permanently unavailable older page closes the pending range with a
retained history gap, so it cannot block new posts indefinitely. When history ends before the checkpoint can be
reached, the cursor keeps an explicit history gap and resumes collecting new posts.
The gap keeps subsequent scans visibly incomplete. It requires an operator review
or a new binding to establish a fresh collection baseline.

An explicit `targetPublishedWindow` has its own cursor scope. Changing that window
starts a separate traversal; abandoning pending traversal records a history gap.
Do not treat moving historical windows as a guarantee of gapless live collection.

For a complete calendar day, set the window in the binding configuration, for example:

```json
{
  "targetPublishedWindow": {
    "startInclusive": "2026-10-17T00:00:00+03:00",
    "endExclusive": "2026-10-18T00:00:00+03:00"
  }
}
```

This example is October 17 in Kyiv, or `[2026-10-16T21:00:00Z,
2026-10-17T21:00:00Z)`. Newer posts are skipped while traversing toward the window;
collection stops at the older boundary. The start is included and the end is
excluded. Use explicit offsets or UTC, and compute each local midnight in the
chosen timezone rather than subtracting a fixed 24 hours across daylight-saving
changes. A completed window can be requested again without inserting duplicate
channel/message identities; a retained cursor also keeps completed posts out
of the next ingestion batch. This time-window contract is independent of which official host serves a page.

## What “incomplete” means

Transport success and coverage are separate. Partial scans persist
`collectionComplete: false` and `backfillPending` in scan execution metadata.
The scan status/list endpoints expose `userState: "scan_degraded"` with an action
for pending backfill or incomplete public content, including zero-item scans.
The UI explains the action. Individual partial posts also retain incomplete native
content capture metadata; they must not be presented as complete text.

Only content Telegram renders anonymously can be collected. Private channels,
restricted/app-only previews, complete media, comments/reactions, edits to old
posts, deletions and a complete historical archive are not guaranteed. Media-only
posts without text are skipped with an incomplete-collection signal. Restricted
or changed HTML fails explicitly. Never bypass an unavailable preview through an
account or bot fallback.

## Verification

```sh
npm run check:telegram-smoke
npm run check:source-certification
npm run check:live-telegram-preview
# Optional anonymous diagnostic for another public channel:
npm run check:live-telegram-preview -- --channel=durov
# Force primary-domain transport failure and verify both mirrors with live HTTPS:
npm run check:live-telegram-preview -- --channel=hiaimediaen --verify-fallback
```

The fallback diagnostic injects network errors for the earlier host(s), then
uses real HTTPS responses from each official mirror. It checks older-page
boundaries and cursor resumption; it does not claim that a real outage occurred.
The live diagnostic prints counts and coverage signals, without channel content
or credentials. It does not manufacture deployment certification. External beta
approval requires an artifact satisfying `telegram_public_preview_live` and the
existing provenance rules; see `ops/ingestion/source-live-certification-evidence.json`.

The DOM extraction was compared with [Horizon’s Telegram scraper](https://github.com/Thysrael/Horizon/blob/8f5446bf45c2d7763d17423d97d17906add85da1/src/scrapers/telegram.py).
Our implementation uses the existing source-provider contract and adds persistent
backfill, a fixed official-host allowlist, a shared timeout budget and explicit
coverage status. Horizon passes `timeout=120.0` to each HTTP request; our
implementation shares one bounded page timeout across all hosts. Rate limiting
stops the chain instead of retrying the same limit on another domain.

Telegram describes account-free channel previews in its
[public-channel preview announcement](https://telegram.org/blog/privacy-discussions-web-bots#view-public-channels).
The [original Bot API proposal](../architecture-memory/223-source-telegram-implementation-v1.md)
is retained as historical context; this acquisition mode is a separate decision.
