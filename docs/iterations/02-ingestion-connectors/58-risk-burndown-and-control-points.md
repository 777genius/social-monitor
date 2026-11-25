# Iteration 02 - Risk Burndown And Control Points

## Burndown Goal
Reduce source reliability and provider-coupling risk before summary work depends on feed data.

## Day 1 Control Point
- SourceProviderPort draft is reviewed.
- Capability profile fields are agreed.
- Certification test scope is defined.

## Midpoint Control Point
- Fake provider passes certification.
- HN/RSS edge fixtures exist.
- Cursor crash/retry behavior is tested.

## Closeout Control Point
- HN and RSS adapters pass certification.
- Normalized feed contains stable IDs and provenance.
- Summary layer needs no provider-specific fields.

## Escalation Threshold
Escalate if a new source request would change feed schema, source policy or cursor semantics.

## Residual Risk Rule
Future source coverage may carry forward; feed normalization and cursor safety risks may not.
