# Iteration 07 / Phase 02 - Onboarding And Support

## Objective

Make first users successful without developer hand-holding.

## Steps

1. Build onboarding flow: create topic, connect source, set scan interval.
2. Add source health explanations.
3. Add empty-state guidance.
4. Add support-safe admin view.
5. Add tenant-visible status model.
6. Add feedback capture.

## Onboarding Flow Contract

1. User selects or creates workspace.
2. User creates a narrow topic with example good/bad query guidance.
3. User selects supported source and sees limitations before binding.
4. User sets scan interval within allowed source/quota limits.
5. User sees first scan status and expected wait.
6. User sees feed results or actionable empty state.
7. User requests or waits for summary.
8. User opens citations and submits feedback.

## Support Taxonomy

| Category | Examples | First Support Action |
| --- | --- | --- |
| onboarding | cannot create topic, confused by source setup | inspect tenant/topic status and guide setup |
| source coverage | wants unsupported source | classify source request by value/access/cost |
| source health | RSS invalid, HN unavailable, quota blocked | view source health and recovery action |
| scan/freshness | scan delayed, no new items | check job status, queue lag, source limits |
| feed quality | noisy/irrelevant items | tune topic/source query and record feedback |
| summary quality | wrong fact, missing source, bad citation | link feedback to summary/evidence/eval fixture |
| delivery/status | no realtime/digest update | inspect delivery attempt/status |
| privacy/data | export/delete request | follow manual DSAR/delete/export path |

Support views must show safe ids, statuses, failure class, correlation id and recovery action without raw credentials, prompts or sensitive source payloads.

## Edge Cases

- User enters invalid RSS URL.
- Source produces no items.
- Summary fails due to low signal.
- User cannot distinguish scan delay from failure.
- User asks why X/Twitter/Reddit is not available.
- User creates topic so broad that quota/noise controls trigger.
- User asks support to inspect private/raw source content.
- User reports wrong summary after artifact was superseded.

## Pay Attention

- Source status must be actionable.
- Support should not need DB access.
- Onboarding should teach by doing, not docs-only.
- Support responses should reinforce source limitations and summary-as-cited-synthesis, not source truth.
- Feedback must include tenant/topic/source/summary context and correlation id when available.

## Acceptance Criteria

- New user can get first summary.
- Failed source shows clear next step.
- Support can inspect status safely.
- Feedback is linked to tenant/topic.
- Support taxonomy and intake form are ready before beta invites.
- Known limitations page is linked from onboarding and source setup.
