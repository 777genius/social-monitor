# Reader Promotion: Two Blocks, Per-Network Percentile, Metric Maturity

## Status

Accepted, 2026-10-24; Top order changed to the hybrid score on 2026-10-29 and
to a minimum popularity cohort on 2026-10-30 (policy stamp
`reader_promotion.2026-10-30`). Supersedes the ordering of the Jev promotion path described
in `docs/plans/2026-09-20-jev-primary-scorer-implementation.md` section 3 item 9
and section 9.2 ("no popularity tie-break", "X likes and HN points are not
comparable"). Selection strategy `jev_primary_v3` is unchanged; only the
promotion order and the board shape change.

## Problem

Inside one (usefulness, relevance) pair the Jev board broke ties by
`signalScore`. Posts without metrics (and Reddit posts with 0 upvotes) received a
substituted "content strength" of 6-9, posts with real upvotes about 5. Reddit
posts with 0 upvotes and every RSS item therefore ranked above posts with 984 or
1204 upvotes. Relevance was also an order key above popularity, although the
model's central/relevant boundary is noisy.

## Decision

1. **Assessments are reused as they are.** No new model call, no rubric change.
   Relevance stays an admission gate (relevant or central) and is no longer an
   order key.
2. **Two separate blocks, each post in exactly one.** Membership comes from one
   table, `READER_PROMOTION_SOURCE_REGISTRY`
   (`libs/summary/domain/policies/reader-promotion-source-registry.ts`):
   `ranked` families (x, reddit, hacker_news, github_radar) feed "Top posts";
   `unranked` families (rss) feed "News without rating". A new unranked source is
   one registry row; the policy has no provider conditionals.
3. **Top order (Top and Show more, one sequence):** hybrid score descending ->
   publishedAt descending -> candidateId (UTF-8 bytes), where

   `score = (1 - W) * model + W * popularity`, `W = 0.6`
   (`READER_PROMOTION_POPULARITY_WEIGHT_PER_MILLE = 600`), model important = 1.0,
   useful = 0.5 (`READER_PROMOTION_MODEL_SCORE_IMPORTANT_PER_MILLE`,
   `..._USEFUL_PER_MILLE`), popularity = the mid-rank percentile
   `(below + equal / 2) / cohortSize` among gate-passed candidates of the same
   family with a mature metric (one entry per source item), 0..1.

   Minimum cohort: a family with fewer than
   `READER_PROMOTION_MIN_POPULARITY_COHORT = 5` such posts has no popularity at
   all, exactly like an immature metric (0 in the score, signal 0, comparator
   `popularity = null`; `metricMature` still states the time maturity). Reason:
   three HN stories with 1-3 points got percentile 5/6 and outranked an
   important X post. This is deliberately coarse: the fifth mature post turns
   the whole family on at once, and a single strong post of a quiet network
   gets no popularity bonus.

   Why a hybrid: with usefulness first, an important post with a handful of
   likes outranked every useful post with thousands, and the reader's Top
   followed the model's boundary more than reader interest. With W = 0.6 an
   important post with a weak metric falls below a strong useful one
   (0.4 + 0.6 * 0.05 = 0.43 < 0.2 + 0.6 * 0.95 = 0.77); a strong important post
   still leads (0.97).

   An unknown metric (missing, immature, malformed) contributes popularity 0 to
   the score. This is deliberate: an unmeasured post never outranks a measured
   one on popularity, an important unknown post still scores 0.4 (above a
   useful post below the 1/3 percentile), and the card shows no invented
   signal (signalScore 0).

   The score is exact: `readerPromotionScore`
   (`libs/summary/domain/policies/reader-promotion-score.ts`) returns a
   fraction with thousandth weights, `numerator = (S - W) * M * 2n + W * S *
   (2b + e)`, `denominator = 2n * S^2` (S = 1000; an unknown metric uses
   n = 1, b = e = 0), and scores compare by BigInt cross-multiplication. The
   ranking core, the attestation order check and the publication guard use the
   same comparator; the Dart verifier must reproduce it with `BigInt`, never
   with doubles. The attestation comparator already carries usefulness and the
   popularity counts, and has no float score field.
4. **Maturity:** a metric is mature when `observedAt - publishedAt >= 6h`
   (`READER_PROMOTION_METRIC_MATURITY_HOURS`). Missing, unobserved, malformed or
   immature metrics are "unknown": never a zero metric value, and popularity 0
   inside the score (item 3).
5. **News order:** usefulness -> publishedAt descending -> candidateId. For
   news.google.com at most one post per real publisher read from the
   "Title - Publisher" suffix (no limit when it cannot be read).
   **A story appears once per page.** A story with posts in both blocks goes to
   news only when its best verified news post is strictly more useful than its
   best ranked post (an important Reuters article over a useful X post); on a
   tie it stays ranked, where it carries a measured signal. A story moved to
   news that does not fit there (capacity or publisher rule) returns to the
   ranked block instead of vanishing. Otherwise Top and Show more pick their
   representatives first, and a story cut by ranked capacity may still reach
   news.
6. **Sizes** (`READER_PROMOTION_LIMITS`): Top is the first 12 ranked posts in
   comparator order, "Show more" (additional) continues the same sequence up to
   48 ranked posts in total, news up to 16. There is no per-network cap: with
   the former cap of 4 per family, HN stories with 1-3 points entered Top while
   stronger X and Reddit posts waited behind the cap, and Top often ended at 9-10
   posts. Networks are made comparable by the per-family percentile instead.
   48 + 16 = 64 equals the headline verification budget; failed headlines spend
   budget too, so such days are coverage-limited.
7. **Card signal:** `percentile * 10` for a mature ranked metric, else 0. The
   content-quality substitution is removed everywhere, including legacy_v2.
8. **Frozen engagement:** the preparation manifest freezes per candidate
   `engagementObservedAt = COALESCE(source_item_engagement_snapshots.last_observed_at,
   feed_items.observed_at)`, read in the same statement as the frozen provider
   metadata. The fallback exists because some days (2026-10-21 and 22) have
   provider metadata with scores and likes but no engagement snapshots. It is
   honestly a lower bound of the metric age, not the exact snapshot time: the
   metrics were captured no earlier than the feed observation, so maturity can
   only be underestimated, never invented. The value uses the v2 signal
   methods: X likes + 2 * reposts, Reddit score, HN points, GitHub
   max(starsDelta, forksDelta / 2); missing or malformed metadata stays unknown.
   A manifest without the field fails closed.
9. **One attestation schema with a policy stamp.** The attestation comparator
   signs block, family, usefulness, relevance, engagement, maturity, popularity
   counts, news publisher, publishedAt and candidateId. Validators recompute
   block, maturity, order, uniqueness, cohort consistency and the card signal
   without trusting card fields. `READER_PROMOTION_POLICY_STAMP` is stored as the
   attestation `policyVersion` and card `promotionPolicyVersion`; it changes
   whenever the meaning of order changes.
10. **No parallel versions.** Artifacts carrying another stamp are read back as
    `promotionBoardState = "rebuild_required"`: promoted cards are withheld,
    REST returns empty boards and `freshness.reason = ranking_policy_changed`.
    No old comparator is kept.

## Consequences

- REST adds `readerBrief.newsWithoutRatingPosts`; attestation placement gains
  `news`, decision gains `promote_news`, the comparator gains the signed fields.
  The Flutter verifier, mapper and fixtures must follow.
- The core is one pure function, `rankReaderPromotionCandidates`
  (`libs/summary/domain/policies/reader-promotion-ranking.ts`), usable offline.
- `legacy_v2` selection is untouched and should be removed in a separate step.
- Rollout: a job whose frozen manifest predates `engagementObservedAt` fails
  terminally as `preparation_manifest_outdated` and is not recreated
  automatically. Before deploying, make sure no reader summary jobs are
  running or queued.

## Risks

- `last_observed_at` advances on every unchanged observation; provider metadata
  is rewritten only when metrics change. They are read in one statement, but a
  feed item whose metadata refresh lagged its snapshot would pair an older value
  with a newer time. The `feed_items.observed_at` fallback has the opposite bias:
  a later refresh of the metadata without a snapshot would make the metric look
  younger than it is.
- Families below five mature posts get no popularity (see item 3); a quiet
  network's strong post competes on usefulness only.
- The headline budget equals the board capacity (64 = 48 ranked + 16 news).
  Every failed headline spends budget, so a day with failed headlines publishes
  fewer cards and is marked coverage-limited rather than reaching deeper into
  the ranking.
- The publication guard does not rerun the ranking core. It checks that the
  signed board is consistent (order, uniqueness, placements, card signal) and
  that engagement and popularity match the frozen manifest and locked
  assessments. It does not prove that the selection is complete, i.e. that no
  better candidate was skipped; that rests on the core and its tests.
- Known debt: three registries map providers to families
  (`READER_PROMOTION_SOURCE_REGISTRY`, the shared-kernel provider aliases and
  `READER_POST_PROMOTION_POLICY_V1.providerAliases`). They agree today; merging
  them is a separate step.
- 64 cards approached the database canonical JSON bounds of
  `reader_summary_v3_publication_canonical_json` (25,000 nodes, 20,000 object
  keys). A realistic board costs about 262 nodes and 233 keys per card; 64
  cards with 3 support spans measured near 17,700 nodes and 15,700 keys, and
  8 spans near 20,900 nodes and 18,300 keys. Migration
  `20261025120000_reader_summary_promotion_board_publication_bounds` raises the
  bounds to 50,000 nodes and 40,000 keys, keeps 16 MiB, and also scans the news
  block for captured source bodies.
- Story identity across one platform is now limited on purpose
  (`libs/summary/domain/services/story-source-identity.ts`): news.google.com,
  x.com and reddit.com no longer make two URLs conflict and the Google News
  publisher suffix is dropped from story text. Google News articles of
  different publishers merge on an exact or semantic headline match. Two X or
  Reddit posts (other authors or one author's crosspost) merge only as a copy:
  the exact headline plus the same body (links removed, at least five words)
  or the same origin link, and never for recurring slot headlines such as
  "Daily Discussion Thread" or "Good morning". The token rules had merged
  unrelated X posts on generic aliases. Reddit `linkedUrl` is not carried into
  story evidence, so link-only crossposts with empty bodies stay separate. Paraphrased headlines below the
  similarity threshold still stay separate (2026-10-22: the $1.25T valuation
  went from six news cards to four; 2026-10-23: three "train without
  internet" articles remain). One large event can still fill most of Top
  through different posts (about 8 of 12 on 2026-10-22); a per-story limit is
  an open product decision.
