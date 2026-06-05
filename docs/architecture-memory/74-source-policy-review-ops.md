# Source Policy Review Operations

Date: 2026-05-31
Status: baseline source policy review memory

## Decision

Source policies must be reviewed operationally, not treated as one-time docs.

Every source/provider has a policy owner and review schedule.

## Review Cadence

High-risk quarterly:

```text
X
Reddit
provider APIs
browser/sidecar connectors if ever used
```

Medium-risk every 6 months:

```text
Telegram
Matrix
ActivityPub/Mastodon
Bluesky/AT Protocol
```

Lower-risk annually or on change:

```text
HN
RSS feeds
manual imports
```

## Review Checklist

Check:

- terms URL;
- API access/pricing;
- rate limits;
- storage permissions;
- deletion requirements;
- redistribution constraints;
- derived summary permissions;
- user-data export implications;
- auth/scopes;
- provider fallback policy;
- risk level.

## Change Handling

If source policy changes:

1. update source policy matrix;
2. assess product impact;
3. disable risky behavior if needed;
4. notify affected tenants if necessary;
5. create ADR/migration note for major behavior change;
6. update connector certification if needed.

## Locked Decisions

1. Source policy review is recurring.
2. X/Reddit/provider APIs are high-risk quarterly review.
3. Policy change can trigger feature kill switch.
4. Source policy owner is required.
5. Connector behavior must follow current source policy matrix.

