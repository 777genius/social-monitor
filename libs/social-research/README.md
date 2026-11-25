# Social Research SDK

`social-research` is the SDK-first facade for manual and automated social
research. It is intentionally source-agnostic: Reddit, X, YouTube, GitHub and
future networks are represented as lanes, items, evidence and ranking goals
instead of provider DTOs.

## Layers

- `domain` owns search intent, search plans, lanes, normalized items and ranking
  policy.
- `application` owns `SocialResearchSdk` and the `SocialResearchGateway`
  contract.
- `infrastructure/ingestion` adapts SDK execution to the existing ingestion
  `SourceFetcherPort`.
- `interfaces/tools` exposes transport-neutral tool handlers and JSON Schemas.
- `interfaces/mcp` registers the same handlers against an MCP-compatible
  `registerTool` surface.

## Public Entry Points

- `@social-monitor/social-research` - core SDK, domain policies and application
  contracts only.
- `@social-monitor/social-research/tools` - transport-neutral tool handlers,
  serializers and schemas.
- `@social-monitor/social-research/mcp` - MCP registration adapter.
- `@social-monitor/social-research/rest` - Nest REST DTO/module/controller.
- `@social-monitor/social-research/grpc` - gRPC service adapter.
- `@social-monitor/social-research/ingestion` - ingestion `SourceFetcherPort`
  gateway adapters.
- `@social-monitor/social-research/cache` - cache implementations.
- `@social-monitor/social-research/contracts` - language-neutral contract
  artifact builder.

## Architecture Rules

- MCP is a thin adapter over the SDK. It must not know provider clients,
  source configs, quotas or ingestion internals.
- Provider execution goes through `SourceFetcherPort`; direct Reddit/X/Youtube
  clients stay outside this package.
- Tool schemas are exported as Zod and JSON Schema so other transports and
  future language SDKs can consume the same contract.
- Tool definitions also publish their handler method, SDK operation id,
  execution-scope requirement and side-effect profile. MCP/REST/gRPC adapters
  should use this catalog instead of hand-maintaining separate operation maps.
- Search execution requires an explicit tenant/workspace execution scope.
- Manual execution can be guarded by `SocialResearchExecutionPolicyPort` and
  cached through `SocialResearchResultCachePort`; transports must not implement
  quota or cache rules themselves.
- `DefaultSocialResearchExecutionPolicy` provides reusable guardrails for
  execution scope, allowed sources, source binding presence, lane limits and
  hashed cache keys.
- The same execution policy enforces source runtime readiness from
  `SocialSourceCapabilityProfile.readiness`; deferred or rejected sources are
  denied before provider execution unless a composition root explicitly relaxes
  the policy.
- Plan creation emits readiness warnings from the same policy inputs, so
  `explain_search_plan` can show provider-read risks before execution starts.
- `EphemeralSocialResearchResultCache` is a bounded TTL cache for local/dev/MCP
  sessions. `PrismaSocialResearchResultCache` is the durable runtime adapter
  behind the same `SocialResearchResultCachePort` contract.
- `SocialResearchSdk` exposes throwing methods for in-process TypeScript callers
  and non-throwing `try*` methods that return `SocialResearchResult<T>` with a
  stable `SocialResearchFailure` envelope for generated SDKs and agent tools.
- Search results include optional `run.trace` metadata with cache status,
  gateway invocation and authorized lane/source counts. Agents should use this
  trace for observability instead of inferring cache hits or provider reads from
  warnings.
- Ergonomic request helpers such as `createSocialSearchIntent(...)` and
  `SocialResearchSdk.searchRequest(...)` compile friendly JSON-first input into
  canonical `SocialSearchIntent` before planning or execution.
- Common semantic lanes are compiled by `SocialQueryStrategy`. Transport callers
  may pass a serializable `SocialQueryStrategyRecipe`, while custom strategy
  functions stay in in-process SDK/runtime composition.
- New sources can extend planning through `SocialSourceLaneStrategy` without
  editing the core planner. Built-in strategies cover X/Bluesky account lanes,
  Reddit community/comment lanes and YouTube transcript enrichment.
- Reddit planning uses bounded multi-pass lanes: fresh search, weekly top
  recall, community listings and top-comment enrichment for selected posts.
- Account-oriented sources can publish a `SocialAccountLaneStrategyRecipe` and
  compile it with `createAccountLaneStrategyFromRecipes(...)`. This keeps common
  account/mention lane syntax serializable for future language SDKs while still
  allowing TypeScript runtimes to inject a normal `SocialSourceLaneStrategy`.
- Provider execution can extend lane batching through
  `SourceFetcherLaneExecutionCompiler`. This keeps high-level SDK lanes
  source-neutral while allowing runtime adapters to compile provider-native
  batches such as Reddit `scanPasses`.
- Composition roots can inject `defaultPlannerOptions` into `SocialResearchSdk`
  so custom strategies, source limits, source capabilities and default sources
  are configured once.
- `npm run check:architecture` enforces the SDK boundary: application code must
  not import transport/infrastructure modules, transport adapters must not
  import provider/runtime clients, and the core entrypoint must stay free of
  adapter exports.

## Contract Artifact

`libs/contracts/social-research/social-research.contract.json` is generated from
the SDK tool schemas, serialized model schemas and operation metadata. It is the
language-neutral contract for MCP, future REST or gRPC adapters, and generated
clients.

`libs/contracts/social-research/social-research.sdk-cases.json` is generated
from the same SDK helper and planner code. It contains golden request, intent,
plan, explanation and failure-envelope cases for future Python, Go or other
language SDKs to verify against.

`libs/contracts/social-research/social-research.sdk-conformance.json` is the
generated checklist for language SDKs: required models, required operations,
safe-method envelopes, serialization rules and boundaries that keep provider
runtime logic out of SDK/MCP adapters.

The conformance artifact also lists executable gates. `npm run
check:social-research-contract` keeps generated contract files in sync, `npm run
check:social-research-sdk-conformance` checks SDK/tool/transport parity, and
`npm run check:architecture` rejects SDK/application/transport boundary leaks.

The contract intentionally exposes source vocabulary as an open-string model:
known sources are listed for convenience, but new networks extend planning
through `SocialSourceLaneStrategy` and provider execution through
`SourceFetcherPort` instead of changing MCP or transport code.

Source capability profiles describe what a source can actually do: lane
operations, lane kinds, content units, cursor/quota model and readiness. The
planner uses them to skip unsupported lanes, so URL-only sources such as RSS do
not masquerade as keyword search providers. Runtime composition can map
ingestion/source-catalog readiness into these SDK-neutral profiles without
importing ingestion into the SDK domain.

`@social-monitor/social-research/ingestion` exposes
`socialSourceCapabilitiesFromRegistry(...)` for composition roots. The shared
runtime uses it to project `SourceProviderRegistryPort` capability/readiness
profiles into SDK planner options once, then all MCP/REST/gRPC handlers share
the same source capability view.

`@social-monitor/social-research/ingestion` also exposes
`createDefaultSourceFetcherLaneExecutionCompiler()`. The shared runtime and
standalone MCP server use it to compile Reddit search/listing/enrichment lanes
into one provider `scanPasses` execution while preserving default one-lane
fallback behavior for sources without a compiler.

The contract also publishes SDK failure/result models. Transport adapters can
keep returning their native response shapes, while generated/manual SDK clients
can use `safeOperationId`, `safeOutputModel` and `failureModel` metadata to
offer non-throwing methods consistently across languages.

The `tools` section is an operation catalog, not just a schema list. Each tool
declares the transport handler method, matching SDK operation id,
execution-scope requirement and side-effect class, so generated agent clients can
decide which calls are local planning/ranking and which perform provider reads.

```sh
npm run check:social-research-contract
npm run check:social-research-sdk-conformance
```

## Adding A Source Extension

Add a new social source in three separate pieces:

- describe the source with a `SocialSourceCapabilityProfile` so the planner can
  keep unsupported lanes out of the plan;
- add a `SocialAccountLaneStrategyRecipe` for account/mention-style syntax when
  the behavior can be represented as a template, then compile it into a
  `SocialSourceLaneStrategy`;
- add a custom `SocialSourceLaneStrategy` when the source needs richer
  source-specific planning such as listings or enrichment lanes;
- add or reuse a `SourceFetcherPort` runtime adapter/compiler for provider
  execution.

Do not put strategy functions into REST/gRPC/MCP JSON. Transport adapters accept
schema-safe request fields and capability profiles only; source-specific strategy
code belongs in SDK/runtime composition. The
`mastodon_extension_request_v1` golden case in
`social-research.sdk-cases.json` is the executable recipe-backed example for
future language SDKs.

## Main Tools

- `search_social`
- `explain_search_plan`
- `fetch_thread`
- `rank_results`

## SDK Ergonomics

```ts
import {
  SocialResearchSdk,
  createSocialResearchRequestBuilder,
  createSocialSearchIntent,
} from '@social-monitor/social-research';

const request = createSocialResearchRequestBuilder(
  'AI agents MCP Claude Code reliability',
)
  .preset('broad_research')
  .source('reddit')
  .source('x-twitter')
  .account('@openai', { sourceKey: 'x-twitter', includeMentions: true })
  .community('ClaudeAI', { sourceKey: 'reddit', listings: ['top'] })
  .products('Claude Code', 'MCP')
  .build();

const intent = createSocialSearchIntent(request);

const sdk = new SocialResearchSdk({ gateway, executionPolicy, resultCache });
const result = await sdk.trySearch(intent);
```

The builder is immutable and returns ordinary `SocialResearchRequestInput`
JSON, so generated SDKs can implement the same ergonomic surface without
copying planner or provider logic. For pure SDK callers the same input can go
directly through
`sdk.searchRequest(...)` or `sdk.trySearchRequest(...)`. The helper is only a UX
layer; the planner still receives the canonical, source-agnostic
`SocialSearchIntent`.

## MCP Stdio Server

Run the thin MCP wrapper with:

```sh
npm run social-research:mcp
```

The stdio app wires `search_social` through the existing ingestion
`SourceFetcherPort`, source-provider registry and monitoring source-binding
config reader. `search_social` still requires an execution scope with source
binding ids and the matching monitoring persistence/credentials configured.

`fetch_thread` uses the same source-fetcher boundary and returns conversation
units when the selected provider/binding can produce them. A dedicated
source-specific thread reader can replace the generic reader later without
changing MCP.

`explain_search_plan` and `rank_results` do not need provider wiring.
Composition roots can also pass a ready `SocialResearchGateway`, a custom
`SourceFetcherPort` or a custom thread reader; MCP keeps provider clients
outside the transport layer.

## REST Adapter

`interfaces/rest` exposes a thin Nest controller over the same SDK handlers.
`SocialResearchRestModule.register(...)` requires a composition root to provide
`SocialResearchToolHandlers` backed by the production gateway, policy and cache.
Tenant and workspace scope come from request headers, not request JSON.

## gRPC Adapter

`libs/contracts/grpc/social_research/v1/social_research.proto` defines the
polyglot service contract. `createSocialResearchGrpcService(...)` maps generated
gRPC requests to the same SDK handlers without provider-client knowledge.
`SocialResearchIntentInput` exposes typed SDK-friendly fields such as preset,
window, accounts, products, keywords, communities and urls. The older
`window_json` and `entities_json` fields remain as compatibility fallbacks.

## gRPC Runtime

Run the production-oriented gRPC wrapper with:

```sh
npm run social-research:grpc
```

Environment:

- `SOCIAL_RESEARCH_GRPC_BIND` defaults to `0.0.0.0:50053`.
- `SOCIAL_RESEARCH_GRPC_SERVICE_TOKEN` enables `authorization: Bearer <token>`
  checks for every RPC, including health.

The gRPC app imports the same shared Nest composition module as MCP, then
registers only the gRPC service adapter. Keep provider clients, source configs,
quotas and cache policy in the SDK/application/runtime composition layers, not
inside gRPC handlers.

## Runtime Policy And Cache

The shared Nest runtime wires `DefaultSocialResearchExecutionPolicy` into every
transport. By default it requires execution scope and source bindings and keeps
result caching disabled. It also shares source readiness profiles with the
planner. Local/test runtime allows `fixture_ready` and `live_beta_ready` source
profiles by default; `SOCIAL_MONITOR_RUNTIME_PROFILE=beta` defaults to
`live_beta_ready` only.

Optional readiness override:

```sh
SOCIAL_RESEARCH_ALLOWED_RUNTIME_READINESS=fixture_ready,live_beta_ready
SOCIAL_RESEARCH_REQUIRE_SOURCE_RUNTIME_READINESS=true
```

Optional local cache:

```sh
SOCIAL_RESEARCH_RESULT_CACHE=ephemeral
SOCIAL_RESEARCH_RESULT_CACHE_TTL_MS=300000
SOCIAL_RESEARCH_RESULT_CACHE_MAX_ENTRIES=250
```

Durable cache:

```sh
SOCIAL_RESEARCH_RESULT_CACHE=prisma
DATABASE_URL=postgres://...
SOCIAL_RESEARCH_RESULT_CACHE_TTL_MS=300000
SOCIAL_RESEARCH_RESULT_CACHE_MAX_ENTRIES=250
```

`ephemeral` cache is process-local and is rejected under
`SOCIAL_MONITOR_RUNTIME_PROFILE=beta`. `prisma` is the durable cache mode for
beta/prod-like profiles. Cache scope is always tenant/workspace based and stays
inside the SDK/application policy, not MCP, REST or gRPC adapters.
