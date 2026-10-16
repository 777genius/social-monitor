# Jev alternatives: a bounded decision-model comparison

Evidence snapshot: **2026-10-15 UTC**. This is research and an evaluation proposal, not a model switch or a measured quality ranking.

The original hosted MiMo research job ended **PARTIAL / task_timeout**, with no final documents. These documents were completed locally from its verified public-source export: 81 files, 1,056,632 decoded bytes, including the model catalog and 36 text files (some empty). No new browsing, inference, installation, or production mutation was performed for this completion. Public text was treated as untrusted data. Export payload SHA-256: `7e5e5ac97e139d0a8944ed36090f9654fefdb06e2752204cb6c80f970fe233aa`.

## What Jev actually does here

Jev classifies captured source text against the workspace's trusted interest. It answers four independent typed questions: **usefulness, relevance, context sufficiency, and evidence basis**. It does not write summaries or headlines. Story clustering, final selection, source-grounded presentation, and publication remain separate product responsibilities.

The inspected source pins `typesafe/jev-1.13`, resolved model `typesafe/jev-1.13-20260917`, and configuration `openrouter-systemone.jev-1.13-20260917.v1`. The scorer uses `POST https://openrouter.ai/api/v1/systemone`, checks the exact resolved model and `TypeSafe` provider, and validates all four choices, confidence, label probabilities, and their sum. The provider's declared choice remains authoritative even when it differs from the probability argmax. See `libs/relevance/domain/reader-value/{reader-value-config,reader-value-rubric,reader-value-assessment}.ts` and `libs/relevance/infrastructure/reader-value/openrouter-reader-value-scorer.ts`.

A chat model is therefore **not a drop-in model-ID substitution**. It needs an evaluation-only translation from state/questions to strict JSON and a separately reviewed adapter before production use. Generated confidence numbers are not automatically calibrated Jev probabilities.

## Same-provider first: 1.13 stable versus 1.14 preview

Both versions are listed at **$0.042 per million input tokens, $0 output tokens**. TypeSafe's model page maps `jev-latest` to `jev-1.13.0` and `jev-preview` to `jev-1.14.0`; 1.14 became available October 14. Do not silently move a tuned system to an alias or preview. OpenRouter's resolved identifiers differ from TypeSafe's direct API identifiers: retain and check the actual returned version. [TypeSafe models](https://docs.typesafe.ai/models), [OpenRouter 1.13](https://openrouter.ai/typesafe/jev-1.13), [OpenRouter 1.14](https://openrouter.ai/typesafe/jev-1.14).

The 1.13 OpenRouter endpoint snapshot explicitly reports `TypeSafe | typesafe/jev-1.13-20260917` at the same price. Its empty `supported_parameters` list is not evidence that chat JSON Schema is supported: Jev uses the structured **Decisions/System One** request shape. Keep the existing stable baseline and evaluate a version-pinned 1.14 arm separately. No quality improvement is established by a newer version number.

TypeSafe's direct API documents default context limits of 64k per request / 32k per question, with an optional long-context mode; OpenRouter's page advertises 262k. Those are different transport configurations, not permission to expand this application's existing bounded input. Current local input, timeout, and response guards stay unchanged.

## Four practical OpenRouter comparison arms

Prices below are **USD per million tokens**, from the saved [OpenRouter model catalog](https://openrouter.ai/api/v1/models), retrieved **2026-10-15T23:17:16Z**, SHA-256 `de275befc2dafae43758380f270cb698268fbb8d39ea5dc1fec6463baf971709`. All four catalog entries list `response_format` and `structured_outputs`. That is model-level advertised support, not proof that every provider endpoint accepts our complete schema.

| Exact model ID | Input / output | Catalog context | Why test it; main uncertainty |
|---|---:|---:|---|
| `openai/gpt-oss-20b` | $0.018 / $0.09 | 131,072 | Lowest listed input price of these arms. Output/reasoning and provider variation can erase the saving; classification and calibration unmeasured. |
| `google/gemini-2.5-flash-lite` | $0.10 / $0.40 | 1,048,576 | Practical low-cost structured-chat comparison. Long context is unnecessary here; endpoint schema restrictions and recall need measurement. |
| `qwen/qwen3-30b-a3b-instruct-2507` | $0.10 / $0.30 | 262,144 | Instruction-model comparison without assuming a reasoning loop. Measure exact enum/schema compliance, subtle security/release context, and multilingual behavior. |
| `openai/gpt-4.1-mini` | $0.40 / $1.60 | 1,047,576 | More expensive reference arm to test whether additional spend improves consequential decisions. Catalog canonical slug is `openai/gpt-4.1-mini-2025-04-14`; actual endpoint identity must be recorded. |

Use the chat-completions transport for these arms, with explicit JSON Schema and unchanged label meanings. Before any calls, verify the chosen endpoint supports the required parameters and exact schema; use supported provider constraints to prevent silent parameter dropping or model fallback. Endpoint compatibility, current availability, and latency have **not** been live-tested in this research. Do not treat JSON validity as semantic accuracy.

The exported structured-output documentation specifically distinguishes endpoint support from model support and warns that strict enforcement varies by provider. Its exact fetched page-URL mapping was not retained; provenance is `docs-canonical-structured-outputs.text`, retrieved **2026-10-15T23:23:13Z**, SHA-256 `ab1e74dc0121ef380a65358fbb1c78aeb881236fdafd6ed1528bd72fcb9d661f`. No URL is invented for that receipt.

For scale intuition only: 1,000 items at 1,000 input + 200 output tokens each would cost approximately **$0.042 Jev**, **$0.036 gpt-oss**, **$0.18 Flash Lite**, **$0.16 Qwen**, or **$0.72 GPT-4.1 mini**, before schema/prompt overhead, reasoning, caching, retries, or discounts. These are arithmetic examples, not measured workload costs. Compare actual billed usage and failed-call costs.

## Evaluate selection quality before bulk history

Start with a frozen recent-day population, not a curated set of winners. The retained October 14 audit has 1,081 source rows: 925 assessed (172 useful, 753 rejected), plus 94 unsupported, 60 appendix, and two capture-unavailable rows. Preserve those distinctions; unsupported or missing-context rows are not automatic model errors. The prior 16 purposive cases illustrate failure modes but provide no accuracy estimate.

The current **targeted 16-case contrast check** addresses a narrow supported contrast fix; it makes no general accuracy claim. The companion JSON separately proposes an **optional model-replacement study**: a 120-item blinded, stratified pilot, then a whole-925 shadow comparison only for promising arms. This broader study is not a prerequisite or global blocker for the core MiMo summary flow or the narrow contrast fix. Keep exact source text, capture clocks, trusted interest, labels, and frozen identities constant. Review actionable releases, security context, evergreen noise, duplication, and abstention separately. Engagement may help find disagreements; it is not ground truth. Do not lower a selection threshold or fabricate available content to make a model look better.

Measure usefulness/importance false negatives and precision, the other three criteria, schema failures, calibration where meaningful, p50/p95 latency, and billed cost. Human adjudication and uncertainty intervals must precede claims of superiority. Pin rubric/prompt/model/provider identities for every arm; any production change needs a genuine new assessment identity and preserves old cache records. No historical mass reclassification, production writes, or deployment is authorized by this plan.

## Provenance and limits

TypeSafe models text was retrieved **2026-10-15T23:27:52Z**; OpenRouter 1.13 page and endpoint text at **23:19:41Z** and **23:19:42Z**. The root agent independently rechecked the three linked model pages around **23:50 UTC**; that approximate time is not presented as an exact fetch receipt. Some exported pages were empty and were not used. Prices and routing are a dated snapshot; recheck only when executing an approved evaluation. No benchmark, quality winner, production switch, or calibration improvement was measured here.
