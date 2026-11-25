# Iteration 04 - Engineering Kickoff Agenda

## Meeting Goal
Build the Flutter MVP loop using feature-scoped Clean Architecture, MobX stores and generated backend clients.

## Required Attendees
- Flutter lead.
- Backend/API owner.
- Product owner.
- QA owner.
- Design/system owner.

## Agenda
1. Confirm feature slices and folder boundaries.
2. Confirm generated REST client integration.
3. Confirm MobX store responsibilities.
4. Confirm required headless component usage.
5. Confirm loading, empty, error, stale and offline states.

## Decisions To Lock
- Mobile target platform for beta.
- DTO-to-domain mapping rules.
- Navigation and state ownership.
- Offline/stale behavior for feed and summaries.

## Edge Cases To Discuss
- API returns partial source or summary data.
- Generated DTO shape changes during backend work.
- User switches topic while scan status updates stream in.
- Summary citations are unavailable or stale.

## First-Day Output
- Flutter shell ticket is ready.
- Feature folder pattern is approved.
- API adapter ticket has contract fixtures.
- Store test approach is clear.
