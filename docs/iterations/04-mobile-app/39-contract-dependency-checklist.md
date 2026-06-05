# Iteration 04 - Contract Dependency Checklist

## Purpose
Ensure Flutter feature slices consume backend contracts safely and produce stable UX expectations for realtime work.

## Input Dependencies
- Generated OpenAPI contract.
- Topic/source/feed/summary API contracts.
- Summary citation schema.
- Error taxonomy and status meanings.
- Problem Details `code` and `recoveryAction` taxonomy.
- Unknown enum/status fallback requirement.

## Output Contracts
- Feature repository interfaces.
- DTO-to-domain mapper rules.
- MobX store state contracts.
- UI state expectations for realtime updates.
- Mobile error display mapping.
- Unknown value handling policy for enums/statuses.
- Recovery action mapping per feature.

## Owners
- Flutter lead owns feature boundaries and store contracts.
- API owner owns generated client stability.
- Product owner owns user-facing states.
- QA owner owns UI state scenarios.

## Breaking-Change Risks
- DTO fields are treated as domain invariants.
- Store state shape changes without updating realtime integration.
- Error codes are displayed inconsistently across features.
- Citation UI assumes fields not guaranteed by backend.
- Feature crashes on new backend enum/status value.
- Recovery action exists in API but no UI action is mapped.

## Transition Readiness
- Iteration 05 can add realtime without bypassing stores.
- Backend contract changes are caught by generated client checks.
- Failure states are explicit enough for beta support.
- Mobile can show safe fallback for unknown status/error values.
- Problem Details mapping is tested for core failures.
