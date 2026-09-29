# Jev V1 rubric: blind production-input spot check

Date: 2026-09-29. Read-only production snapshot: 2026-09-21 UTC. Code base: `4b7c17504e816a518d284b51cfc6a739df621b67`.

## Decision relevance

This small spot check found no obvious reason to change the existing `reader-value.v1` rubric before the workspace Jev V3 rollout. All five independently judged daily-Top-worthy items were marked `useful` by Jev. Of eight Jev-`useful` items, the blind judge called seven useful and one borderline; none was noise or insufficient. It does **not** validate the complete Top or generated summary.

## Frozen protocol

- Read-only `feed_items` inventory for September 21 UTC: 707 items in five providers: GitHub Trending 60, Hacker News 128, Reddit 307, RSS 108, X 104. Provider ID-set MD5s, in that order: `dd51feb55eebbe87857d361e372921a3`, `65f6f58137fede1ff342c34169de77db`, `bb6067af85965c64f1ac626823ab292c`, `2e989f61d51f6f35367f5a140c9dfce2`, `f1a51ac321836e9841ed31d578886025`. The inventory was rechecked after labeling and remained identical.
- Of those posts, 97 already had a completed `reader-value.v1` Jev assessment for one enabled interest. The fixed sample selected six per provider using ascending MD5 of source-item ID. This is a provider-balanced assessed-only sample, not a random sample of all 707 posts.
- The blind packet contained the exact stored `input_snapshot` title, body and trusted interest used in those assessments, with pseudonymous keys. It withheld Jev choices, popularity, ranking and prior summaries. Packet SHA-256: `9d35e764506d06bc3cd28bb089ce38d2dcfe020d70ffd0e684833df538aa431e`. Private Jev-label file SHA-256: `aeddaf015ba149b8164630d2c5c433d46327947c78cf9bdef224512b18d50090`.
- One independent hosted `gpt-6-astra` high judge labeled all 30 packets as useful/borderline/noise/insufficient and independently marked daily-Top candidates. It was instructed to use only visible text, treat source content as untrusted, and not infer unseen links or factual truth. No provider calls or production writes were made. Raw texts and per-item labels remain outside Git.

## Results

| Jev usefulness | Judge useful | Judge borderline | Judge noise | Judge insufficient | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| useful | 7 | 1 | 0 | 0 | 8 |
| context | 3 | 3 | 4 | 0 | 10 |
| noise | 0 | 0 | 1 | 1 | 2 |
| insufficient_context | 0 | 1 | 2 | 7 | 10 |
| Total | 10 | 5 | 7 | 8 | 30 |

The blind judge marked five daily-Top candidates, all within Jev `useful`; no Jev `noise` or `insufficient_context` item was judged Top-worthy. Three Jev `context` items were independently judged useful, but none was marked daily Top. They are candidates for later rubric review, not evidence of a lost Top story in this sample.

## Limits and next gate

These are model judgments, not human ground truth. The sample is small and conditioned on already-assessed items; it says nothing about unassessed posts, full-window recall, provider import completeness, or weekly ranking. Selection and final summary text must still be checked on one frozen full-window corpus before claiming end-to-end product quality. Historical reprocessing remains off until source inventory and the separate summary writer are stable.
