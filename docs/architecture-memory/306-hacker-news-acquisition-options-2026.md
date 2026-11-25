# 306 - Hacker News Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Official Hacker News API: https://github.com/HackerNews/API
- HN Firebase endpoint: https://hacker-news.firebaseio.com/v0/
- HN Algolia Search: https://hn.algolia.com/about

## Current Reality

Hacker News is the best low-friction source for MVP.

It has an official Firebase API for canonical items and an Algolia-powered search interface for keyword discovery.

## Option A - Official Firebase API Polling

Pros:

- official
- no commercial platform approval friction
- simple JSON
- canonical item ids
- good for stories/comments/users

Cons:

- polling required
- no advanced search
- item tree traversal can be expensive
- no strong delivery guarantees

Use for:

- top/new/best story scans
- item hydration
- comment tree bounded ingestion

## Option B - maxitem Incremental Discovery

Pros:

- broad new-item detection
- simple cursor

Cons:

- can be noisy
- bounded scan windows needed
- may fetch many irrelevant items

Use for:

- low-volume MVP experiments
- backfill windows with strict caps

## Option C - Algolia HN Search

Pros:

- keyword search
- time filters
- convenient topic discovery

Cons:

- not canonical HN state
- external search provider behavior
- must rehydrate important items from official API where practical

Use for:

- topic candidate generation
- search-based monitoring

## Option D - Page Scraping

Pros:

- easy manual inspection

Cons:

- unnecessary because official API exists
- brittle
- less structured

Decision:

- not needed

## Recommended Path

MVP:

```text
official Firebase API for canonical retrieval
optional Algolia search adapter for keyword discovery
```

## Architecture Rule

HN is the source to prove ingestion, dedupe, comments and summaries before expensive social APIs.
