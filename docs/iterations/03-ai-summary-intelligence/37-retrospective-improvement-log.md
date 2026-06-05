# Iteration 03 - Retrospective Improvement Log

## Retrospective Goal
Capture whether summary quality, citation discipline and cost controls are strong enough for mobile beta UX.

## What Worked
- Citation model made summary trust inspectable.
- AI provider port kept model/provider decisions isolated.
- Eval harness gave a repeatable path for prompt and model changes.

## What To Improve
- Expand golden datasets where summaries look plausible but wrong.
- Improve user-configurable rules that are hard to validate.
- Add clearer failure reasons for mobile display.

## Architecture Lessons
- AI output is external input and must be validated like provider data.
- Final summaries need evidence, not just fluent text.
- Cost telemetry must be part of acceptance, not later analytics.

## Edge Cases Found
- Model invents citation or references missing item.
- Evidence conflicts across sources.
- Provider returns valid structure with invalid business meaning.
- Token budget is exhausted by noisy feed data.

## Carryover To Next Iteration
- Mobile must show citations and summary failure states.
- Backend APIs must expose enough status for trust and retries.
- Any eval gap should become a quality metric before beta.
