# 349 - Farcaster/Nostr Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Farcaster docs: https://docs.farcaster.xyz/
- Farcaster developer guide context: https://dtech.vision/farcaster/hubs/
- Nostr NIPs registry: https://nips.nostr.com/
- Nostr NIP-50 search capability: https://nostr.co.uk/nips/nip-50/
- Nostr developer guide: https://nostrcg.github.io/devguide/protocol/overview/
- Example relay capability/rate-limit disclosure: https://vertexlab.io/docs/endpoints/nostr-relay/

## Current Reality

Farcaster and Nostr are attractive for this product because they are protocol-oriented and more open than closed social networks.

They are also not "one API equals complete truth" systems:

- Farcaster data is accessed through protocol nodes/indexers.
- Nostr data is spread across relays with different support, retention and search behavior.

## Farcaster Option A - Run/Query Protocol Node or Replicator

Pros:

- strong data ownership and reproducibility
- suitable for advanced indexing
- less dependency on a single SaaS API vendor

Cons:

- infrastructure cost and operational complexity
- schema/protocol changes must be tracked
- still requires product-level moderation/deletion policy

Use for:

- later power-user/web3 package

## Farcaster Option B - Third-Party Indexer/API

Pros:

- fast integration
- easier search and account/cast lookup
- lower infra burden

Cons:

- vendor dependency
- coverage/latency/cost must be measured
- may limit historical export

Use for:

- early connector prototype

## Nostr Option C - Direct Relay Subscriptions

Pros:

- protocol-native
- real-time where relays support subscriptions
- no central platform dependency

Cons:

- relay fragmentation
- duplicates across relays
- event deletion/replacement semantics must be handled
- spam quality varies heavily

Use for:

- selected relay lists
- known pubkey/topic monitoring

## Nostr Option D - NIP-50 Search Relays

Pros:

- search capability is protocol-defined
- useful for keyword discovery

Cons:

- NIP-50 is optional
- search quality varies per relay
- rate limits/retention differ by relay

Use for:

- best-effort topic discovery

## Recommended Path

```text
Nostr experimental adapter + Farcaster third-party indexer prototype
```

Later:

```text
own indexer/replicator for paid advanced tier
```

## Architecture Rule

Protocol sources need `SourceTruthPolicy`: store relay/indexer provenance with every item and never imply global completeness.

