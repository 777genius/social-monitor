# 331 - Snapchat Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Snap Public Profile API introduction: https://developers.snap.com/api/marketing-api/Public-Profile-API/Introduction
- Snap Public Profile API get started: https://developers.snap.com/api/marketing-api/Public-Profile-API/GetStarted
- Snap Public Profile API metrics: https://developers.snap.com/api/marketing-api/Public-Profile-API/Metrics
- Snap Marketing API: https://developers.snap.com/api/marketing-api/overview

## Current Reality

Snapchat is mostly relevant for creator/brand public profile metrics and marketing workflows.

It is not a general public text/social listening source.

## Option A - Public Profile API

Pros:

- official Snap API
- retrieves metadata and statistics for public profiles/content
- supports creator opt-in and OAuth partner workflows
- useful for owned/authorized profile analytics

Cons:

- not broad public keyword monitoring
- access/permissions required
- metrics-oriented rather than conversation-oriented
- limited summary value unless content metadata is rich

Use for:

- owned/authorized Snapchat creator/brand profile monitoring

## Option B - Marketing API

Pros:

- official
- useful for ads/campaign metrics
- enterprise/customer acquisition workflows

Cons:

- ads/marketing focus
- not organic public listening
- account authorization required

Use only if product expands to campaign monitoring.

## Option C - Social Listening Vendor

Pros:

- may provide broader trend/media coverage
- avoids building media-heavy pipeline

Cons:

- coverage likely opaque
- high cost
- rights/terms review required

Use behind provider adapter if demanded.

## Option D - Scraping/Public Story Capture

Pros:

- may seem to capture public content

Cons:

- very high policy/privacy risk
- ephemeral media complexity
- not scalable or reliable

Decision:

- not production path

## Recommended Path

Defer Snapchat.

If added:

```text
owned/authorized Public Profile API metrics first
```

## Architecture Rule

Snapchat support means authorized profile/marketing analytics, not broad social scanning.
