# Iteration 07 / Phase 04 - Post-Beta Learning Loop

## Objective

Turn beta usage into roadmap decisions without breaking architecture.

## Steps

1. Review source usage and failure rates.
2. Review summary usefulness and eval gaps.
3. Review costs by tenant/source/topic.
4. Review onboarding drop-offs.
5. Review support issues and incident reports.
6. Decide next sources by priority matrix.
7. Update architecture memory and ADRs.

## Feedback Classification

Classify every feedback item as:

1. core loop blocker
2. source coverage request
3. source reliability issue
4. feed relevance/noise issue
5. summary quality/citation issue
6. onboarding/support confusion
7. API/operator UX issue; future frontend UX issue
8. delivery/realtime issue
9. cost/quota issue
10. post-MVP idea

Each item gets severity, affected tenant/topic/source, evidence link, owner, decision and next action.

## Post-Beta Decision Rules

Promote to next iteration only when:

1. there is repeated beta evidence
2. access/legal/source path is safe
3. cost is acceptable or controllable
4. architecture path fits ports/adapters and existing bounded contexts
5. support burden is understood
6. success metric is clear

Do not prioritize a source or feature only because it is loud or interesting.

## Edge Cases

- Users want expensive source before willingness to pay.
- AI summary quality varies by source.
- Most value comes from unexpected source.
- Costs exceed assumed unit economics.
- Feedback volume is low but incidents are severe.
- Users ask for broad coverage but actually value one reliable source deeply.
- Summary feedback is subjective and conflicts with eval fixtures.
- A requested source is valuable but only through paid provider path.

## Pay Attention

- Do not add every requested source immediately.
- Use evidence: usage, cost, quality, support burden.
- Keep adapters replaceable.
- Update docs/ADRs immediately when beta evidence changes source priority or architecture assumptions.
- Separate "need better prompting" from "need better input/source/relevance".

## Acceptance Criteria

- Beta review report exists.
- Next iteration priorities chosen.
- Architecture docs updated.
- Risk register refreshed.
- Feedback is categorized and linked to evidence.
- Post-MVP roadmap separates blockers, accepted gaps, opportunities and deferred ideas.
