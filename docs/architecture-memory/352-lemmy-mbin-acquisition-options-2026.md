# 352 - Lemmy/Mbin Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Lemmy API docs: https://join-lemmy.org/api/main
- SearXNG Lemmy engine notes: https://docs.searxng.org/dev/engines/online/lemmy.html
- Mbin docs: https://docs.joinmbin.org/
- Lemmy API marketplace overview: https://www.oanor.com/api/lemmy-api

## Current Reality

Lemmy and Mbin are federated Reddit-like communities. They are valuable for monitoring Reddit alternatives, open-source communities and fediverse discussions.

The main complexity is federation: no single instance is complete, instances can block each other, and search results depend on which instance is queried.

## Option A - Query Selected Lemmy Instances

Pros:

- official/open API shape
- supports posts, comments, communities and users
- maps well to Reddit-like normalized content

Cons:

- instance-specific visibility
- duplicates and missing objects across instances
- per-instance availability and moderation policies vary

Use for:

- selected instance/community watchlists
- Reddit-alternative monitoring

## Option B - Multi-Instance Search Registry

Pros:

- better coverage than one instance
- can score active instances and communities
- creates product differentiation through source health transparency

Cons:

- needs instance registry and health checks
- dedupe becomes mandatory
- more connector complexity

Use for:

- early SaaS after source catalog exists

## Option C - ActivityPub/Federation-Level Ingestion

Pros:

- protocol-native
- potential for broader fediverse link-aggregator coverage

Cons:

- high protocol complexity
- moderation/deletion/security responsibilities
- not needed for MVP

Use for:

- later advanced fediverse integration

## Option D - Hosted API Wrapper

Pros:

- fastest prototype
- avoids handling per-instance quirks initially

Cons:

- vendor dependency
- coverage/provenance must be verified
- may not be appropriate for core data ownership

Use for:

- temporary prototype or fallback adapter

## Recommended Path

```text
selected Lemmy instances + community watchlists
```

Later:

```text
multi-instance registry with provenance and dedupe
```

## Architecture Rule

Every Lemmy/Mbin item must store `instance_host`, `community_actor_id`, `canonical_ap_url` and `federation_visibility`.

