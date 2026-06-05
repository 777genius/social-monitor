# 313 - Competitor Project Profiles 2026

## Last Verified

2026-06-04.

## Sources

- Brandwatch sources: https://social-media-management-help.brandwatch.com/hc/en-us/articles/4556945084701-Sources-for-Listen-Mentions
- Sprout data availability: https://support.sproutsocial.com/hc/en-us/articles/360056024132-Social-Listening-data-availability-and-limitations
- Brand24 sources filter: https://help.brand24.com/en/articles/9159632-sources-filter
- Awario monitoring tools: https://awario.com/social-media-monitoring-tools/
- Fedica FAQ: https://fedica.com/info/faq
- Syften: https://syften.com/
- Badour: https://badour.io/
- Redmonitor: https://www.redmonitor.io/
- Octolens MCP: https://octolens.com/mcp
- LeadEcho: https://leadecho.app/

## Enterprise Products

### Brandwatch

Publicly claims:

- X official partner/full firehose
- Reddit official partner/full firehose
- broad web/news/blog/forum/review source library
- connected-source requirements for LinkedIn/TikTok-owned channels

Implication:

- enterprise breadth depends on official/partner access and indexed data library
- not a cheap MVP pattern

### Sprout Social

Public docs list source-specific limits:

- Reddit automatic backfill limits
- LinkedIn only owned pages
- TikTok connected owned videos/comments/mentions
- Facebook listening limited to Pages
- X sampled data

Implication:

- even enterprise tools expose hard platform limits
- source capability matrix is mandatory

### Meltwater / Talkwalker / Brand24 / Awario

Pattern:

- broad monitored source categories
- keyword query setup
- sentiment/AI analysis
- dashboards/alerts
- often unclear exact acquisition method per source

Implication:

- if we use third-party provider data, demand source-level coverage and rights disclosure

## Indie/Developer Products

### Syften

Focus:

- developer/community keyword monitoring
- Reddit, X, HN, GitHub, blogs, forums, Slack communities, Bluesky, Mastodon and more

Implication:

- narrow alerting across many community sources is viable for small teams

### Badour

Focus:

- Reddit, HN, Stack Overflow, GitHub, Lobsters, Mastodon, Bluesky
- AI relevance
- notes that Twitter/X handling differs because not all sources allow full pass-through analysis

Implication:

- source-specific capability honesty is a product advantage

### Redmonitor

Focus:

- Reddit, Hacker News, Twitter
- AI noise filtering
- founder/lead monitoring

Implication:

- a focused source set can be a good MVP business wedge

### Octolens / LeadEcho

Focus:

- multi-source lead/signal monitoring
- AI filtering and delivery integrations
- MCP/API-style access in Octolens

Implication:

- future differentiator: expose our monitored intelligence through API/MCP/webhooks

## Strategic Takeaway

Two viable product paths:

```text
enterprise social listening -> partner/firehose/provider data
indie/community monitoring -> official APIs + open web + AI relevance + alerts
```

For us:

- start as indie/community monitoring with summaries
- keep enterprise partner data as replaceable adapters
- be explicit about source limitations

## Architecture Rule

Coverage claims must map to acquisition modes.

If we cannot explain how a source is monitored, we cannot sell it responsibly.
