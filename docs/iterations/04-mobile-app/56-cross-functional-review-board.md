# Iteration 04 - Cross-Functional Review Board

## Review Goal
Approve the mobile MVP loop before realtime status is layered onto it.

## Required Reviewers
- Flutter lead.
- Backend/API owner.
- Product owner.
- Design/system owner.
- QA owner.
- Realtime lead.

## Review Questions
- Can a user complete the core loop?
- Are generated DTOs isolated from domain models?
- Do MobX stores avoid business rules?
- Are loading, empty, error, stale and offline states covered?
- Can realtime integrate through stores without bypassing architecture?

## Required Evidence
- App walkthrough.
- Mapper/store test results.
- Generated client compatibility evidence.
- UI state screenshots or golden states.
- Citation drill-down scenario.

## Approval Rule
Promote only if realtime can enhance the app without fixing core-loop or boundary problems first.
