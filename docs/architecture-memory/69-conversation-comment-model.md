# Conversation & Comment Model

Date: 2026-05-31
Status: baseline conversation/comment memory

## Decision

Model posts/items and conversations separately.

Some sources are flat feeds; others have nested comments, replies, quote posts or federated activities. The canonical model must support conversation structure without forcing every source into the same shape.

## Core Entities

```text
source_items
source_conversations
source_item_edges
source_authors
```

## Item Types

```text
post
comment
reply
quote
repost
story
link
message
activity
```

## Edges

```text
parent_of
reply_to
quote_of
repost_of
mentions
links_to
same_conversation
```

## Comment Hydration

Comment/reply fetching must be bounded:

```text
max_depth
max_items
max_runtime
max_cost
sort_policy
```

Do not recursively hydrate unbounded threads.

## Conversation Summary

Conversation summaries should use:

- root item;
- selected high-signal comments/replies;
- engagement metadata;
- diversity of viewpoints if relevant;
- bounded token budget.

## Source Examples

HN:

- item tree;
- comments nested by kids.

Reddit:

- posts and comments;
- comment trees can be large;
- deleted/removed comments matter.

X:

- posts, replies, quote posts, reposts;
- thread reconstruction may be partial/costly.

Telegram/Matrix:

- messages/replies in permissioned rooms/channels.

## Locked Decisions

1. Item and conversation are separate concepts.
2. Relationships are represented as edges.
3. Comment hydration is bounded.
4. Conversation summaries do not require full thread hydration by default.
5. Deleted/removed comments are represented explicitly.

