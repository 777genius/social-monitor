# 382 - MusicBrainz/ListenBrainz Music Signal Options 2026

## Last Verified

2026-06-04.

## Sources

- ListenBrainz docs: https://listenbrainz.readthedocs.io/
- MusicBrainz platform/API context: https://en.wikipedia.org/wiki/MusicBrainz
- ListenBrainz dataset paper: https://zenodo.org/records/14877361/files/000044.pdf
- ListenBrainz/MusicBrainz integration context reviewed 2026-06-04.

## Current Reality

MusicBrainz and ListenBrainz are not social listening sources in the normal sense.

They are open music metadata and listening-signal sources. They can enrich music/culture monitoring and trend analysis, especially if the product later targets music, creators, labels or fan communities.

## MusicBrainz Option A - Metadata API

Pros:

- open, structured music metadata
- strong for artist/release/recording identity resolution
- useful for dedupe and entity enrichment

Cons:

- not a review/conversation source
- metadata freshness depends on community edits

Use for:

- enrichment, not scanning

## ListenBrainz Option B - Listening Data API

Pros:

- open listening-history ecosystem
- useful for music trend/context signals
- supports open data/research orientation

Cons:

- not representative of all music listening
- privacy/user-consent considerations
- not a replacement for social conversation monitoring

Use for:

- external signal enrichment

## Option C - Music Community Reviews

Examples:

- RateYourMusic
- album forums
- Reddit music communities
- artist Discord/Telegram

Decision:

```text
separate source evaluation required
```

## Recommended Path

```text
use MusicBrainz as entity metadata provider; defer ListenBrainz until music vertical exists
```

## Architecture Rule

Open metadata providers should implement `EntityMetadataProviderPort`, not `SocialSourceProviderPort`.

