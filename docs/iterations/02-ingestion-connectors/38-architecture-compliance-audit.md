# Iteration 02 - Architecture Compliance Audit

## Audit Goal
Verify that ingestion connectors are provider-neutral, reliable, policy-compliant and safe for summarization to consume.

## Required Checks
- SourceProviderPort hides provider-specific payloads from ingestion use cases.
- Every adapter has a capability profile and certification test results.
- Cursor state changes only after durable item persistence.
- Provider errors are mapped into a stable taxonomy.
- Feed domain stores normalized data with provenance.

## Critical Violations
- Raw provider payload becomes the core feed model.
- Adapter-specific logic leaks into summarization or mobile contracts.
- Cursor advances before durable write.
- Unsupported browser/bypass scraping is treated as a production connector.

## SOLID And Clean Architecture Focus
- Open/closed: adding a source should add an adapter, not rewrite ingestion use cases.
- Liskov substitution: fake, HN and RSS providers must satisfy the same port expectations.
- Dependency inversion: scheduler/workers call use cases, not provider SDKs directly.

## Evidence Required
- Connector certification test report.
- Normalized feed sample.
- Cursor persistence example.
- Retry/dead-letter behavior.
- Source policy approval.

## Closure Rule
Iteration 03 cannot start if summaries need provider-specific fields to work.
