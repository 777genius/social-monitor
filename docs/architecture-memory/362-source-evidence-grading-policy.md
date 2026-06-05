# 362 - Source Evidence Grading Policy

## Purpose

When researching source acquisition, not all evidence has equal weight.

This policy defines how we grade sources before turning research into architecture decisions.

## Evidence Grades

### Grade A - Official Platform Documentation

Examples:

- official API docs
- official developer portals
- official changelogs
- official pricing/limits

Use:

- production decisions
- connector contracts
- user-facing capability claims

### Grade B - Protocol Specs / Open Standards

Examples:

- ActivityPub
- AT Protocol/Bluesky docs
- Nostr NIPs
- Matrix spec
- IRCv3

Use:

- protocol-source architecture
- implementation contracts

Risk:

- implementations may differ by instance/relay/server

### Grade C - Reputable Tooling / Research Papers

Examples:

- 4CAT papers/docs
- Twarc docs
- SocialPulse
- academic source-availability reports

Use:

- design inspiration
- evaluation methods
- schema/provenance ideas

Risk:

- research workflows are not production SLAs

### Grade D - Vendor Marketing / Product Pages

Examples:

- social listening vendor coverage claims
- scraping/data provider pages
- SEO comparison pages

Use:

- market mapping
- possible vendor shortlist

Risk:

- coverage claims may be incomplete or optimistic

### Grade E - Community Reports / Reddit / Forums

Use:

- detect breakage, pain points and market demand
- never as sole source for production capability claims

Risk:

- anecdotal
- can be outdated or wrong

## Decision Rule

Production connector approval requires at least one Grade A or Grade B source.

Vendor-only connector approval requires:

- Grade D vendor docs
- contract review
- source provenance review
- legal/data-right review

Rejected/not-production-safe decisions can be supported by Grade C/D/E evidence when the risk pattern is repeated and official access is absent.

## Architecture Rule

Every source option document should list evidence quality implicitly through its source list and explicitly in future procurement reviews.

