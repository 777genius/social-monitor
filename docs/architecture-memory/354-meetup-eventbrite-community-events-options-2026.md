# 354 - Meetup/Eventbrite Community Events Options 2026

## Last Verified

2026-06-04.

## Sources

- Meetup API guide: https://www.meetup.com/api/guide
- Meetup API schema: https://www.meetup.com/api/schema/
- Eventbrite platform API: https://www.eventbrite.com/platform/api/
- Eventbrite events API docs: https://www.eventbrite.com/platform/docs/events

## Current Reality

Meetup and Eventbrite are not social feeds, but they are strong sources for community intent, product/community launches, local meetups, conferences and interest clusters.

They should be modeled as event/community sources, not post/comment sources.

## Meetup Option A - Official GraphQL API

Pros:

- official API surface
- supports groups, events, topics and photos
- good for community/event monitoring

Cons:

- API version and schema changes must be tracked
- access/auth requirements apply
- not a broad conversation source

Use for:

- group/event watchlists
- topic/location-based community monitoring

## Eventbrite Option B - Official API

Pros:

- official OAuth API
- useful for organizer-owned events and event detail enrichment
- stable event identifiers

Cons:

- broad public event search may be constrained by auth/product policy
- best fit is owned organizer/event workflows
- less conversational data

Use for:

- tenant-owned event monitoring
- event discovery where API terms allow

## Option C - Search/Calendar Discovery

Pros:

- can discover public event pages through SERP providers
- useful as candidate URL input

Cons:

- incomplete
- delayed
- must not imply official platform coverage

Use for:

- candidate discovery only

## Recommended Path

```text
optional event-source family after core social/feed ingestion
```

## Architecture Rule

Use a separate `EventSourceProviderPort` with event-specific fields: `start_time`, `end_time`, `venue`, `organizer`, `capacity`, `rsvp_count`, `topic_tags`.

