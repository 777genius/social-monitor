# 384 - Source Roadmap Gaming/Media Reviews

## Purpose

Gaming and media sources can be valuable vertical packages after the generic MVP works.

## Gaming Sources

Candidate sources:

- Steam reviews
- Steam discussions/groups
- Reddit gaming communities
- Discord/Matrix/Telegram game communities with authorization
- YouTube/Twitch comments and streams
- itch.io forums/community threads

Recommended first source:

```text
Steam app reviews
```

Reason:

- documented endpoint
- strong product reputation signal
- high value for indie game developers

## Film/TV Sources

Candidate sources:

- Letterboxd
- Reddit film communities
- YouTube comments/trailers
- TMDb for metadata enrichment

Recommended first source:

```text
Letterboxd official/beta API only if access is granted
```

## Books/Publishing Sources

Candidate sources:

- Goodreads
- Reddit book communities
- Amazon book reviews
- StoryGraph
- publisher/author forums

Recommended first source:

```text
Reddit/book communities + open web; Goodreads only vendor/research
```

## Architecture Rule

Vertical source packages should be enabled after core primitives are stable:

- source capability registry
- review normalization
- entity metadata providers
- summary evaluation
- tenant-visible source limitations

