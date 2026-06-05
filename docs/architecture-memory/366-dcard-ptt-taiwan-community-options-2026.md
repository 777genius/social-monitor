# 366 - Dcard/PTT Taiwan Community Options 2026

## Last Verified

2026-06-04.

## Sources

- LargitData Taiwan/community coverage: https://course.largitdata.com/en/social-media-api/
- Dcard third-party data API example: https://bycrawl.com/docs/api-reference/dcard
- Dcard Premier API docs context: https://premier.dcardtech.com/ro/api-documentation/links
- PTT platform context: https://en.wikipedia.org/wiki/PTT_Bulletin_Board_System
- PTT research context: https://test-api.ijosi.org/uploads/file/articles/608/submission/proof/608-1-4904-1-10-20230320.pdf

## Current Reality

Dcard and PTT are important Taiwan-region community sources. They are especially relevant for regional market research, consumer discussions and public opinion monitoring.

They are not first-wave global MVP sources unless Taiwan/Chinese-language coverage is a target.

## Dcard Option A - Official/Commercial API Path

Pros:

- best path if official/commercial access matches monitoring needs
- can support structured business integrations

Cons:

- public discussion search access must be verified
- may be limited to specific commercial products

Use for:

- regional enterprise integration

## Dcard/PTT Option B - Regional Data Vendor

Pros:

- realistic route for monitoring public regional communities
- can bundle Dcard, PTT, Mobile01 and related sources
- useful for Chinese-language market intelligence

Cons:

- vendor provenance and retention rights must be reviewed
- export/AI summarization rights must be explicit
- coverage can be source/category dependent

Use for:

- `vendor_adapter_only`

## PTT Option C - Protocol/Open Forum Collection

Pros:

- long-running public forum ecosystem
- valuable historical/community signal

Cons:

- technical access is forum/protocol-specific
- public/private board distinctions and local rules matter
- must avoid over-collection and preserve source etiquette

Use for:

- limited board/watchlist monitoring after policy review

## Recommended Path

```text
regional vendor first; direct connectors only for explicitly allowed public boards/forums
```

## Architecture Rule

Dcard/PTT should be modeled as regional community/forum sources with `locale`, `board/forum`, `language`, `source_policy_url` and `vendor_provenance`.

