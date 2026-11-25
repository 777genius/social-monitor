# Iteration 04 - Edge Case Playbook

## Scenario - Generated DTO Leaks Into Domain

- Signal: Domain imports API client models.
- Validate: Boundary review/test.
- Mitigation: Add infrastructure mapper and domain model.

## Scenario - Empty Feed Looks Broken

- Signal: User sees blank feed before first scan.
- Validate: First-run UI scenario.
- Mitigation: Show scan status, source binding state and next run time.

## Scenario - Summary Failed But Feed Is Healthy

- Signal: UI implies whole topic failed.
- Validate: Backend returns feed OK and summary failed.
- Mitigation: Display separate summary failure with feed still available.

## Scenario - App Resumes With Stale Data

- Signal: Old feed/summary shown after source changes.
- Validate: Offline/resume scenario.
- Mitigation: Show stale indicator and revalidate on resume.
