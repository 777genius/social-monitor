# Telegram public channel previews

Provider key: `telegram`. Anonymous HTTPS requests to `https://t.me/s/<channel>`;
no Telegram account, bot, token, channel membership or extra container is needed.
The provider is implemented and fixture-certified. Deployment-scoped live evidence
remains required before external beta approval.

## Add a source

In Sources, choose Telegram and enter `@channel`, `channel`,
`https://t.me/channel` or `https://t.me/s/channel`. The UI normalizes the username.
The source binding API accepts:

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
```

The live diagnostic prints counts and coverage signals, without channel content
or credentials. It does not manufacture deployment certification. External beta
approval requires an artifact satisfying `telegram_public_preview_live` and the
existing provenance rules; see `ops/ingestion/source-live-certification-evidence.json`.

The DOM extraction was compared with [Horizon’s Telegram scraper](https://github.com/Thysrael/Horizon/blob/8f5446bf45c2d7763d17423d97d17906add85da1/src/scrapers/telegram.py).
Our implementation uses the existing source-provider contract and adds persistent
backfill, fixed-host HTTP safety and explicit coverage status.

Telegram describes account-free channel previews in its
[public-channel preview announcement](https://telegram.org/blog/privacy-discussions-web-bots#view-public-channels).
The [original Bot API proposal](../architecture-memory/223-source-telegram-implementation-v1.md)
is retained as historical context; this acquisition mode is a separate decision.
