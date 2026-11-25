# 377 - Regional Source Roadmap Asia 2026

## Last Verified

2026-06-04.

## Purpose

Asia-region sources have high product value but require careful sequencing.

## Source Groups

### Korea

Candidate sources:

- Naver Blog/Search
- Daum Cafe Search
- Kakao owned channels
- LINE owned channels for markets where LINE dominates

Recommended path:

```text
official search APIs first; messaging owned-channel later
```

### China

Candidate sources:

- Weibo
- WeChat Official Accounts
- RedNote/Xiaohongshu
- Douyin
- Kuaishou
- Bilibili

Recommended path:

```text
enterprise vendor/partner only; no MVP direct scraping
```

### Taiwan

Candidate sources:

- Dcard
- PTT
- Mobile01

Recommended path:

```text
regional data vendor first; direct public forum connectors only after policy review
```

### Japan / Southeast Asia

Candidate sources:

- LINE owned channels
- local forums
- marketplace/review platforms
- regional SERP/search providers

Recommended path:

```text
research later after MVP validates core scanning/summarization workflow
```

## MVP Decision

Asia regional coverage is not MVP core unless the first users explicitly need it.

MVP should keep architecture ready through:

- locale-aware normalization
- source/vendor capability profiles
- per-source language metadata
- tenant-visible limitations
- vendor adapter boundaries

## Architecture Rule

Regional coverage is a product package, not a connector pile.

