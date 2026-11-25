# 309 - Meta Instagram/Facebook Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Meta Graph API docs: https://developers.facebook.com/docs/graph-api/
- Instagram Platform docs: https://developers.facebook.com/docs/instagram-platform/
- Instagram Graph API docs: https://developers.facebook.com/docs/instagram-api/
- Sprout connected profiles: https://support.sproutsocial.com/hc/en-us/articles/37919752654989-How-do-I-use-Connected-Profiles-in-Listening
- Sprout listening data availability: https://support.sproutsocial.com/hc/en-us/articles/360056024132-Social-Listening-data-availability-and-limitations

## Current Reality

Meta sources are mainly strong for owned/connected business assets, not broad arbitrary public listening.

Public Instagram/Facebook monitoring is restricted, permission-heavy and often available through partner/social-listening products rather than simple public APIs.

## Option A - Instagram/Facebook Graph API For Owned Assets

Pros:

- official
- good for business/creator accounts/pages
- comments, mentions and media depending permissions
- aligns with tenant-owned monitoring

Cons:

- app review/permissions
- business account/page linking complexity
- not broad competitor/public search
- API versions/deprecations

Use for:

- tenant-owned Instagram/Facebook pages/accounts
- comments/mentions/inbox-like workflows where approved

## Option B - Connected Profiles Through Social Listening Vendor

Pros:

- easier enterprise workflow
- vendor handles permissions and source mapping
- useful for owned social data across networks

Cons:

- vendor lock-in
- package limits
- not raw-data flexible

Use as optional enterprise adapter.

## Option C - Hashtag/Public Discovery APIs

Pros:

- can support limited campaign/hashtag discovery where available

Cons:

- strongly limited
- business-account requirements
- privacy constraints
- not reliable as general search

Use with strict capability checks only.

## Option D - Meta Content Library / Research Paths

Pros:

- official research/transparency path where eligible

Cons:

- eligibility/use-case restrictions
- not normal commercial social listening path
- data gaps and terms constraints

Use only if product purpose qualifies.

## Option E - Scraping Instagram/Facebook UI

Pros:

- appears to access public pages

Cons:

- high breakage
- anti-abuse/account risk
- privacy/terms risk
- not enterprise-safe

Decision:

- not production path

## Recommended Path

For this product:

```text
defer Meta broad listening
support owned/connected business profiles later
use vendor adapter if customers demand broad Meta coverage
```

## Architecture Rule

Meta is not an MVP source for broad public listening.

Treat it as owned-profile integration unless official/partner access says otherwise.
