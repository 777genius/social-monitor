# Iteration 03 - Day By Day Sequence

## Day 1 - Summary Domain

- Define SummaryPolicy.
- Define rule value objects.
- Define evidence model.
- Check: invalid policies fail before provider call.

## Day 2 - AI Port And Adapter

- Define AiSummarizerPort.
- Implement provider adapter.
- Add structured output schema.
- Check: malformed output is rejected.

## Day 3 - Pipeline

- Select/rank feed items.
- Build evidence bundle.
- Persist summary and citations.
- Check: every summary claim links to source evidence.

## Day 4 - Evals And Cost

- Add golden datasets.
- Add eval command.
- Add cost/token telemetry.
- Check: prompt change requires eval.

## Day 5 - API And Closure

- Expose summary endpoints.
- Expose feedback endpoint.
- Run acceptance tests.
- Stop if citations or cost visibility are missing.
