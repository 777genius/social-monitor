# 389 - Live/Video Source Family

## Purpose

Video and live-streaming sources require a different model from text-first social networks.

Examples:

- YouTube
- Twitch
- Vimeo
- Dailymotion
- PeerTube
- Rumble
- Odysee
- Kick

## Source Types

```text
video_search
channel_watchlist
playlist_watchlist
live_stream_lifecycle
live_chat
comments
transcripts
captions/text_tracks
VOD replay
clip/highlight
```

## Common Fields

```text
video_id
channel_id
creator_id
title
description
published_at
duration
live_status
view_count
comment_count
like_count
transcript_available
caption_languages
source_url
thumbnail_url
```

## Edge Cases

- search results are not complete or stable
- comments can be disabled
- captions may be absent or auto-generated
- live chat may not be retrievable after stream end
- VOD ids may differ from live event ids
- region restrictions affect visibility
- mature/safety filters affect discovery

## Product Modules

- video mention monitoring
- transcript summarization
- comment sentiment digest
- live stream alerting
- creator/channel watchlists
- competitor video launch monitoring

## Architecture Rule

Video search, video metadata, comments, live events and transcripts should be separate capabilities on a shared `VideoSourceProviderPort`, not hard-coded assumptions.

