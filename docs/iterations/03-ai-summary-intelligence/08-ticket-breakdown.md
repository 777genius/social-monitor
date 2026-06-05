# Iteration 03 - Ticket Breakdown

## Phase 01 - Summary Domain Contract

### T03-01 - Model Summary Policy

- Context: Summarization
- Layer: Domain
- Artifacts: `SummaryPolicy`, value objects, invariants
- Steps:
  1. Define language, tone, length, sections and citation requirements.
  2. Define forbidden or unsupported rules.
  3. Link policy to topic and tenant.
  4. Add domain tests for invalid combinations.
- Edge cases:
  - User asks for no citations.
  - User asks for impossible length/detail combination.
- Acceptance:
  - Invalid policy is rejected before AI provider call.

### T03-02 - Define Summary Evidence Model

- Context: Summarization/Feed
- Layer: Domain/application contract
- Artifacts: source evidence schema, summary output schema
- Steps:
  1. Define cited item references.
  2. Define claim-to-source mapping.
  3. Define confidence and missing-evidence fields.
  4. Define summary history shape.
- Edge cases:
  - Source item becomes unavailable.
  - Summary contains claim without evidence.
- Acceptance:
  - Every persisted summary can be audited back to source items.

## Phase 02 - AI Provider Adapter

### T03-03 - Implement AI Summarizer Port

- Context: Summarization
- Layer: Application port/adapter
- Artifacts: `AiSummarizerPort`, provider adapter, prompt templates
- Steps:
  1. Define structured output contract.
  2. Add model/provider config.
  3. Add timeout, retry and cancellation.
  4. Add cost and token tracking.
  5. Add schema validation of provider output.
- Edge cases:
  - Provider returns malformed JSON.
  - Provider times out after cost is incurred.
  - Prompt exceeds context window.
- Acceptance:
  - Provider can be swapped without changing use cases.

## Phase 03 - Evals And Quality

### T03-04 - Add Summary Evaluation Harness

- Context: Summarization
- Layer: Tests/quality
- Artifacts: golden datasets, eval command, regression metrics
- Steps:
  1. Create HN/RSS sample bundles.
  2. Define factuality, relevance, citation and rule-adherence checks.
  3. Add snapshot or semantic regression workflow.
  4. Track cost per summary.
- Edge cases:
  - Model improves style but loses citations.
  - Prompt change increases cost significantly.
- Acceptance:
  - Prompt/model changes require eval run.

## Phase 04 - Summary UX Readiness

### T03-05 - Expose Summary API And Feedback

- Context: Summarization/API
- Layer: REST/application
- Artifacts: summary endpoints, feedback endpoint, OpenAPI
- Steps:
  1. Expose latest summary by topic.
  2. Expose summary history.
  3. Expose cited source items.
  4. Add user feedback fields.
  5. Emit summary status events.
- Edge cases:
  - Summary still running.
  - Summary failed but feed is healthy.
- Acceptance:
  - Mobile can display latest summary, citations and failure state.
