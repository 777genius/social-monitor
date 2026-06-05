# 390 - Creator/Crowdfunding Source Family

## Purpose

Creator and crowdfunding platforms generate important product/community signals but are not normal public social networks.

Examples:

- Patreon
- Ko-fi
- Buy Me a Coffee
- Kickstarter
- Indiegogo
- Product Hunt
- Substack paid/public posts

## Source Modes

```text
public_creator_updates
owned_creator_account
supporter_payment_events
membership_events
campaign_updates
campaign_comments
campaign_metrics
```

## Visibility Rules

Every item must declare:

- `public`
- `free_member_only`
- `paid_member_only`
- `backer_only`
- `follower_only`
- `owner_only`

Private/member/backer-only content must never be ingested unless the tenant owns or explicitly authorizes the account and the platform terms allow it.

## Product Use Cases

- creator digest
- competitor campaign tracking
- product launch monitoring
- supporter/customer event summaries
- campaign health alerts
- creator reputation and moderation monitoring

## Common Fields

```text
creator_id
campaign_id
post_id
update_id
visibility_tier
published_at
title
body
comment_count
supporter_count
funding_amount
funding_goal
currency
campaign_state
```

## Architecture Rule

Creator/crowdfunding sources should not enter through generic social search. They need authorization-aware provider adapters and visibility-aware retention.

