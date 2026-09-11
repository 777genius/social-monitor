import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { PureCanonicalPlanCompiler } from "./x-canonical-plan-compiler";
import { xSemanticDigest } from "./x-canonical-digest";
import { snapshotPlan } from "./x-canonical-plan-input";
import { parseConfig } from "../../adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-config";
import { DefaultSourceQueryPlanRuntimeCompiler } from "../../adapters/source/source-query-plan-runtime-compiler";
import { mergeXRuntimeQueryBudgets } from "../../adapters/source/x-source-query-plan-runtime-budget";
import type { SourceProviderScanContext } from "../../ports";

const byteHash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sourcePaths = [
  "libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-config.ts",
  "libs/ingestion/adapters/source/source-query-plan-runtime-compiler.ts",
  "libs/ingestion/adapters/source/x-source-query-plan-runtime-budget.ts",
  "libs/ingestion/adapters/source/adaptive-source-pagination.ts",
  "libs/ingestion/adapters/source/source-item-ranking-config.ts",
  "libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider.ts",
  "apps/x-collector/src/x_collector/search_plan.py", "apps/x-collector/src/x_collector/scweet_adapter.py",
  "apps/x-collector/src/x_collector/search_budget.py", "libs/ingestion/infrastructure/x-observation/x-canonical-digest.ts",
  "libs/ingestion/infrastructure/x-observation/x-canonical-plan-compiler.ts", "libs/ingestion/infrastructure/x-observation/x-canonical-plan-input.ts",
  "libs/ingestion/domain/x-observation/x-canonical-graph-policy.ts", "libs/ingestion/features/observe-retained-x/x-canonical-plan.contracts.ts",
  "apps/x-collector/src/x_collector/canonical_graph_compiler.py", "apps/x-collector/src/x_collector/canonical_sdk_builders.py",
  "apps/x-collector/src/x_collector/config.py",
  "apps/x-collector/src/x_collector/domain.py",
  "libs/shared-kernel/src/ids.ts",
  "libs/monitoring/features/shared/source-binding-scan-query.ts",
  "libs/ingestion/domain/x-observation/x-canonical-predicate.ts",
  "libs/ingestion/domain/x-observation/x-canonical-query-budget.ts",
  "libs/ingestion/domain/x-observation/x-canonical-days.ts",
];
const pins = Object.fromEntries(sourcePaths.map((path) => [path, byteHash(readFileSync(path))]));
const preparedExpansionHashes = new Set<string>();
const compiler = { compile: (input: unknown, expansion: unknown) => new PureCanonicalPlanCompiler({
  digest: xSemanticDigest, utf8Digest: byteHash, verifiedSourcePins: pins,
  verifiedSdkExpansionHashes: [...preparedExpansionHashes],
}).compile(input, expansion) };
// Exact public binding strings; these are current inputs, not a historical ScanPlan.
const queries = [
  '"Claude Code" (release OR update OR workflow OR benchmark OR production OR GitHub OR skill OR MCP)',
  '("OpenAI Codex" OR "Cursor AI" OR "Cursor editor") (release OR update OR workflow OR benchmark OR production)',
  '(MCP OR "model context protocol") (server OR release OR integration OR security OR tool)',
  '(OpenAI OR Anthropic OR Claude OR Gemini) (release OR model OR API OR benchmark OR research)',
  '("AI agent" OR "coding agent") (release OR framework OR "open source" OR benchmark OR production)',
  '(cybersecurity OR "AI security" OR infosec) (vulnerability OR research OR release OR benchmark OR tool)',
  '(LangChain OR Ollama OR "RAG pipeline" OR "RAG system") (release OR benchmark OR production OR "open source")',
  '("vibe coding" OR "agentic coding") (tool OR workflow OR release OR benchmark OR production)',
  '"AI regulation" OR "AI governance" OR "AI safety" OR "AI privacy" OR "AI copyright"',
  '"LLM inference" OR "AI chips" OR "AI data center" OR "model training" OR "AI benchmark" OR "LLM benchmark"',
];

function fixture(distinct = false, maxItems = 25, products = ["top"], splits = 5) {
  const count = distinct ? 11 : 10, primary = distinct ? "synthetic distinct primary" : queries[0]!;
  const config = { searchQueries: queries, maxSearchQueries: count, language: "en", minLikes: 30, minRetweets: 0,
    minReplies: 0, requireQueryMatch: true, searchProducts: products, limitPerProduct: 50,
    ...(maxItems === 25 ? {} : { maxItems }) };
  const command = { mode: "search" as const, query: primary, parameters: {} };
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(Date.UTC(2026, 7, 30 + i)), end = new Date(start.getTime() + 86400000);
    return { day: start.toISOString().slice(0, 10), cellId: `synthetic-cell-${i}`, clockAt: end.toISOString(),
      windowStart: start.toISOString(), windowEnd: end.toISOString(), targetItems: 100 as const,
      scanJobId: `synthetic-scan-${i}`, predecessorHash: "c".repeat(64) };
  });
  const scope = { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace", sourceBindingId: "synthetic-binding",
    interestId: "synthetic-interest", scanPolicyId: "synthetic-policy", correlationId: "synthetic-correlation" };
  const allQueries = distinct ? [primary, ...queries] : queries;
  const requests = days.flatMap((day) => allQueries.map((query, laneOrdinal) => ({ day: day.day, laneOrdinal, request: {
    request_id: `${day.scanJobId}:${laneOrdinal + 1}:1`, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
    source_binding_id: scope.sourceBindingId, scan_job_id: day.scanJobId, correlation_id: scope.correlationId,
    query, language: "en", window_hours: 24, window_end: day.windowEnd, search_products: products,
    limit_per_product: 50, max_items: Math.ceil(maxItems / count), min_likes: 30, min_retweets: 0, min_replies: 0, cursor: null,
  } })));
  const python = spawnSync("python3", ["-S", "-c", [
    "import sys,json", "sys.path[:0]=['apps/x-collector/src','apps/x-collector/tests']",
    "from support.canonical_graph_support import sdk,profile",
    "from x_collector.canonical_graph_compiler import compile_expansion,semantic_hash",
    "p=profile(); p['nSplits']=int(sys.argv[1])",
    "p['profileHash']=semantic_hash({k:v for k,v in p.items() if k not in ('profileHash','operationManifestHash')})",
    "r=compile_expansion(json.load(sys.stdin),p,sdk())",
    "assert r['ok'],r", "print(json.dumps({'profile':p,'expansion':r['value']}))",
  ].join("\n"), String(splits)], { input: JSON.stringify(requests), encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, maxBuffer: 10_000_000 });
  expect(python.status).toBe(0);
  if (python.status !== 0) throw new Error(python.stderr);
  const { profile, expansion } = JSON.parse(python.stdout);
  preparedExpansionHashes.add(xSemanticDigest(expansion));
  const input = { base: "429e0f229c50f596d708216708775456b788251b", evidenceMode: "SYNTHETIC",
    inputEvidence: [{ kind: "explicit-synthetic-command", provenance: "SYNTHETIC", sha256: "d".repeat(64), observedAt: "2026-09-08T00:00:00.000Z" }],
    sourcePins: pins, scope, entrypoint: "binding-scan", bindingConfig: { query: primary }, command, configReader: config,
    planner: { branch: "absent", injected: false, plan: null, compilation: null },
    scanPlan: { query: command, maxItems, cursorPresence: "ABSENT", cursorHash: null }, effectiveConfig: config,
    maxSearchQueries: count, amendmentId: "synthetic-exact-lane-cap", days, sdkProfile: profile,
    sdkExpansionHash: xSemanticDigest(expansion), retained: [], acceptedSiblingHashes: ["e".repeat(64)] };
  return { input, expansion };
}

describe("pure canonical proposed graph compiler", () => {
  it("rejects incompatible recorded duration before historical day overlay", () => {
    const { input, expansion } = fixture();
    const recorded = { ...input, entrypoint: "recorded-command", configReader: { ...input.configReader, windowHours: 48 },
      effectiveConfig: { ...input.effectiveConfig, windowHours: 48 } };
    expect(compiler.compile(recorded, expansion)).toEqual({ ok: false,
      error: { code: "UNSUPPORTED_PROFILE", path: "effectiveConfig.windowHours" } });
    expect(compiler.compile({ ...recorded, configReader: { ...recorded.configReader, windowHours: 24 },
      effectiveConfig: { ...recorded.effectiveConfig, windowHours: 24 } }, expansion).ok).toBe(true);
  });
  const fixtures: ReturnType<typeof fixture>[] = [];
  beforeAll(() => { fixtures.push(fixture(), fixture(true)); });
  it.each([0, 1])("successfully compiles the whole seven-day synthetic fixture %s", (index) => {
    const { input, expansion } = fixtures[index]!, result = compiler.compile(input, expansion);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.value.bounds.days.map((day) => day.K)).toEqual(Array(7).fill(index === 0 ? 150 : 165));
    expect(result.value.bounds.totalSendLimit).toBe(index === 0 ? 5292 : 5817);
    expect(result.value.lanes.every((lane) => lane.budget === 3 && lane.predicate.minReposts === 0)).toBe(true);
    expect(result.value.productionGraphFrozen).toBe(false);
    expect(result.value.releaseState).toBe("PROPOSED");
    expect(compiler.compile(input, expansion)).toEqual(result);
    expect(Object.isFrozen(result.value.lanes[0]!.predicate)).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain("schemaVersion");
    if (process.env.E2_ARTIFACT_DIRECTORY) {
      const directory = process.env.E2_ARTIFACT_DIRECTORY;
      mkdirSync(directory, { recursive: true });
      for (const [name, value] of Object.entries({ input, expansion, plan: result.value })) {
        writeFileSync(join(directory, `synthetic-${index === 0 ? 10 : 11}-${name}.json`), JSON.stringify(value, null, 2) + "\n");
      }
    }
  });
  it("detects default8 truncation without equating acceptance100 with default25", () => {
    const { input } = fixtures[0]!;
    const parsed = parseConfig({ query: input.command, maxItems: 25 },
      { config: { ...input.configReader, maxSearchQueries: undefined } } as unknown as SourceProviderScanContext,
      new Date("2026-09-06T00:00:00.000Z"));
    expect(parsed.searchQueries).toEqual(queries.slice(0, 8));
    expect(parsed.maxItemsPerQuery).toBe(4);
    const invalid = clone(input); invalid.maxSearchQueries = 8; invalid.effectiveConfig.maxSearchQueries = 8; invalid.configReader.maxSearchQueries = 8;
    expect(compiler.compile(invalid, fixtures[0]!.expansion)).toMatchObject({ ok: false, error: { code: "QUERY_LOSS_OR_OVERFLOW" } });
  });
  it("rejects missing actual inputs and never converts an interest row into ScanPlan", () => {
    expect(compiler.compile({ kind: "current_public_configuration_not_frozen_grant", rows: [{ query: "interest" }] }, {}))
      .toMatchObject({ ok: false, error: { code: "MISSING_INPUT" } });
    for (const key of ["command", "scanPlan", "sourcePins", "sdkProfile", "days"]) {
      const input: Record<string, unknown> = clone(fixtures[0]!.input); delete input[key];
      expect(compiler.compile(input, fixtures[0]!.expansion).ok).toBe(false);
    }
  });
  it("rejects source/hash tamper, nested cap shadowing, unknown fields, and duplicate coordinates", () => {
    const { input, expansion } = fixtures[0]!;
    for (const change of [
      { sourcePins: { ...pins, [sourcePaths[0]!]: "f".repeat(64) } }, { maxSearchQueries: 17 },
      { effectiveConfig: { ...input.effectiveConfig, queryPlan: { maxQueries: 8 } } }, { unexpected: true },
    ]) expect(compiler.compile({ ...input, ...change }, expansion).ok).toBe(false);
    const changed = clone(expansion); changed.invocations[0].passes[0].streams.reverse();
    expect(compiler.compile({ ...input, sdkExpansionHash: xSemanticDigest(changed) }, changed)).toMatchObject({ ok: false });
  });
  it("snapshots ownership and decimal ratios without executing getters", () => {
    const input = { nested: ["original"], adaptivePagination: { maxDuplicateRate: 0.7 } };
    const saved = snapshotPlan(input); input.nested[0] = "changed";
    expect(saved.nested).toEqual(["original"]); expect(saved.adaptivePagination.maxDuplicateRate).toBe("0.7");
    expect(() => xSemanticDigest(saved)).not.toThrow();
    const getter = jest.fn();
    expect(() => snapshotPlan(Object.defineProperty({}, "value", { get: getter, enumerable: true }))).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const invalid of [undefined, NaN, Infinity, 1.5, new Date("2026-09-01"), { value: undefined }]) expect(() => snapshotPlan(invalid)).toThrow();
    expect(snapshotPlan({ maxDuplicateRate: 1e-7 })).toEqual({ maxDuplicateRate: "0.0000001" });
  });
  it("executes configured-first planner compilation and config precedence with duplicate budgets", () => {
    const { input, expansion } = fixtures[0]!;
    const configReader = { ...input.configReader, maxItems: 90, maxSearchQueries: 15, enableSourceQueryPlanner: true };
    const command = { ...input.command, parameters: { maxItems: 25, maxSearchQueries: 16 } };
    const plan = { plannerId: "synthetic-planner", intent: { topic: "synthetic", sourceKeys: ["x-twitter"] }, warnings: [],
      lanes: [{ laneId: "synthetic-lane", sourceKey: "x-twitter" as const, kind: "general" as const, operation: "search" as const,
        query: queries[0]!.toUpperCase(), priority: 100, maxItems: 2, reason: "synthetic duplicate" }] };
    const compilation = new DefaultSourceQueryPlanRuntimeCompiler().compile({ providerKey: "x-twitter-experimental-daily",
      originalSourceQuery: command, runtimeConfig: { ...configReader, ...command.parameters }, plan });
    expect(compilation.sourceQuery.query).toBe(queries[0]);
    expect(compilation.sourceQuery.parameters!.maxSearchQueries).toBe(10);
    const compiledInput = { ...input, command, configReader, planner: { branch: "compiled", injected: true, plan, compilation },
      effectiveConfig: { ...configReader, ...command.parameters, ...compilation.sourceQuery.parameters },
      scanPlan: { ...input.scanPlan, query: compilation.sourceQuery } };
    expect(compiler.compile(compiledInput, expansion)).toMatchObject({ ok: true });
    expect(compiler.compile({ ...compiledInput, planner: { ...compiledInput.planner, compilation: {} } }, expansion).ok).toBe(false);
    expect(mergeXRuntimeQueryBudgets([{ query: "A  B", maxItems: 7 }], { searchQueries: ["a b"], maxItemsPerQuery: 3 }, 16).budgets)
      .toEqual([{ query: "a b", maxItems: 7 }]);
    const parsed = parseConfig({ query: { mode: "search", query: "a b" }, maxItems: 25 },
      { ...input.scope, tenantId: tenantId(input.scope.tenantId), workspaceId: workspaceId(input.scope.workspaceId),
        scanJobId: "synthetic-scan", config: { searchQueries: ["A  B"], searchQueryBudgets: [{ query: "A  B", maxItems: 9 }] } },
      new Date("2026-09-06T00:00:00.000Z"));
    expect(parsed.searchQueries).toEqual(["a b", "A  B"]); expect(parsed.maxItemsBySearchQuery.get("A  B")).toBe(9);
  });
  it("executes disabled, absent and degraded branches while preserving explicit100 and adaptive targets", () => {
    for (const branch of ["disabled", "absent", "degraded"]) {
      const { input, expansion } = fixtures[0]!, config = { ...input.effectiveConfig, enableSourceQueryPlanner: branch !== "disabled" };
      expect(compiler.compile({ ...input, configReader: config, effectiveConfig: config,
        planner: { branch, injected: branch !== "absent", plan: null, compilation: null } }, expansion).ok).toBe(true);
    }
    const explicit = fixture(false, 100), result = compiler.compile(explicit.input, explicit.expansion);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.value.lanes.every((lane) => lane.budget === 10)).toBe(true);
    const { input, expansion } = fixtures[0]!, config = { ...input.effectiveConfig,
      adaptivePagination: { enabled: true, targetItems: 100, maxPages: 5, minNewItemsPerPage: 3, maxDuplicateRate: 0.7 } };
    const adaptive = compiler.compile({ ...input, configReader: config, effectiveConfig: config }, expansion);
    expect(adaptive).toMatchObject({ ok: true });
    if (adaptive.ok) {
      expect(adaptive.value.lanes.every((lane) => lane.target === 10 && lane.budget === 3)).toBe(true);
      expect(adaptive.value.inputSnapshot.scanPlan.maxItems).toBe(25);
      expect(JSON.stringify(adaptive.value.resolvedSettings)).toContain('"maxDuplicateRate":"0.7"');
      expect(JSON.stringify(adaptive.value.resolvedSettings)).not.toContain("generatedAt");
    }
  });
  it("retains ownership after full compile and rejects missing/rehashed descriptor coordinates", () => {
    const input = clone(fixtures[0]!.input), expansion = clone(fixtures[0]!.expansion);
    const result = compiler.compile(input, expansion);
    expect(result.ok).toBe(true);
    const before = JSON.stringify(result);
    input.configReader.searchQueries[0] = "mutated caller query";
    expansion.invocations[0].passes[0].streams[0].rawQuery = "mutated caller stream";
    expect(JSON.stringify(result)).toBe(before);
    const original = fixtures[0]!;
    for (const mutate of [
      (e: typeof expansion) => e.invocations[0].passes[0].streams.pop(),
      (e: typeof expansion) => { e.invocations[0].passes[0].streams[0].splitWindow.until = "2026-08-30_23:59:59_UTC"; },
      (e: typeof expansion) => { e.invocations[0].passes[0].minReplies = 4; },
    ]) {
      const altered = clone(original.expansion); mutate(altered);
      expect(compiler.compile({ ...original.input, sdkExpansionHash: xSemanticDigest(altered) }, altered).ok).toBe(false);
    }
    const retained = [{ day: "2026-08-30", streamId: "synthetic-retained", pageLimit: 5, descriptorHash: "f".repeat(64) }];
    expect(compiler.compile({ ...original.input, retained }, original.expansion)).toMatchObject({ ok: true, value: { bounds: { totalSendLimit: 5297 } } });
    retained[0]!.streamId = original.expansion.invocations[0].passes[0].streams[0].streamId;
    expect(compiler.compile({ ...original.input, retained }, original.expansion)).toMatchObject({ ok: false, error: { code: "DUPLICATE_COORDINATE" } });
    expect(compiler.compile({ ...original.input, evidenceMode: "DEPLOYMENT" }, original.expansion)).toMatchObject({ ok: false, error: { code: "MISSING_INPUT" } });
  });
  it("detects configured and local query overflow and rejects unsupported nested data", () => {
    const { input, expansion } = fixtures[0]!;
    for (const extra of [{ searchQueries: Array.from({ length: 17 }, (_, i) => `synthetic-${i}`) },
      { queryPlan: { handles: Array.from({ length: 17 }, (_, i) => `handle${i}`) } }]) {
      const config = { ...input.effectiveConfig, ...extra, maxSearchQueries: 16 };
      expect(compiler.compile({ ...input, configReader: config, effectiveConfig: config, maxSearchQueries: 16 }, expansion))
        .toMatchObject({ ok: false, error: { code: "QUERY_LOSS_OR_OVERFLOW" } });
    }
    const config = { ...input.effectiveConfig, queryPlan: { productTerms: { unknown: "rejected" } } };
    expect(compiler.compile({ ...input, configReader: config, effectiveConfig: config }, expansion))
      .toMatchObject({ ok: false, error: { code: "UNSUPPORTED_PROFILE" } });
  });
  it("binds prepared SDK bytes independently of input-controlled replacement hashes", () => {
    const { input, expansion } = fixtures[0]!;
    type MutableStream = { normalizedRequestHash: string; rawQuery: string; rawQueryHash: string;
      parametersWithoutCursor: { variables: string }; parametersHash: string };
    for (const mutate of [
      (s: MutableStream) => { s.normalizedRequestHash = "0".repeat(64); },
      (s: MutableStream) => {
        s.rawQuery = "unrelated query"; s.rawQueryHash = byteHash(s.rawQuery);
        s.parametersWithoutCursor.variables = JSON.stringify({ ...JSON.parse(s.parametersWithoutCursor.variables), rawQuery: s.rawQuery });
        s.parametersHash = xSemanticDigest(s.parametersWithoutCursor);
      },
      (s: MutableStream) => { s.parametersWithoutCursor.variables += " "; s.parametersHash = xSemanticDigest(s.parametersWithoutCursor); },
    ]) {
      const altered = clone(expansion); mutate(altered.invocations[0].passes[0].streams[0]);
      expect(compiler.compile({ ...input, sdkExpansionHash: xSemanticDigest(altered) }, altered))
        .toMatchObject({ ok: false, error: { code: "SDK_EXPANSION_MISMATCH" } });
    }
    const verified = [input.sdkExpansionHash], instance = new PureCanonicalPlanCompiler({ digest: xSemanticDigest,
      utf8Digest: byteHash, verifiedSourcePins: pins, verifiedSdkExpansionHashes: verified });
    verified.length = 0;
    expect(instance.compile(input, expansion).ok).toBe(true);
  });
  it("positively matches all 2205 descriptors to pinned actual adapter and SDK semantics", () => {
    const result = spawnSync("python3", ["-S", "-c", [
      "import json,sys", "sys.path[:0]=['apps/x-collector/src','apps/x-collector/tests']",
      "from support.canonical_graph_support import assert_expansion_builder_parity",
      "cases=json.load(sys.stdin)",
      "print(sum(assert_expansion_builder_parity(c['expansion'],c['input']['sdkProfile']) for c in cases))",
    ].join("\n")], { input: JSON.stringify(fixtures), encoding: "utf8", maxBuffer: 10_000_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    expect({ status: result.status, error: result.stderr }).toEqual({ status: 0, error: "" });
    expect(result.stdout.trim()).toBe("2205");
  });
  it("checks exact raw queries for every actual public string and every planned coordinate", () => {
    for (const { input, expansion } of fixtures) for (const invocation of expansion.invocations) {
      for (const pass of invocation.passes) for (const stream of pass.streams) {
        const minima = ` min_faves:${pass.minLikes}` + (pass.minReplies ? ` min_replies:${pass.minReplies}` : "") +
          (pass.minRetweets ? ` min_retweets:${pass.minRetweets}` : "");
        expect(stream.rawQuery).toBe(`${invocation.request.query} lang:en -filter:replies -filter:retweets${minima}` +
          ` since:${stream.splitWindow.since.slice(0, -4)} until:${stream.splitWindow.until.slice(0, -4)}`);
        expect(stream.parametersWithoutCursor.features).toBe(JSON.stringify(input.sdkProfile.features));
      }
    }
  });
  it("compiles varied actual split counts and product branches with retained inventory", () => {
    for (const products of [["latest"], ["latest", "top"]]) {
      const { input, expansion } = fixture(false, 25, products, 1);
      const result = compiler.compile({ ...input, retained: [{ day: input.days[0]!.day,
        streamId: "retained-one", pageLimit: 5, descriptorHash: "f".repeat(64) }] }, expansion);
      expect(result).toMatchObject({ ok: true, value: { bounds: { totalSendLimit: 1097 } } });
      if (result.ok) expect(result.value.bounds.days.map((day) => day.K)).toEqual(Array(7).fill(30));
    }
  });
  it("retains incoming cursor presence and rejects missing temporal/scope authority", () => {
    const { input, expansion } = fixtures[0]!;
    expect(compiler.compile({ ...input, scanPlan: { ...input.scanPlan, cursorPresence: "PRESENT", cursorHash: "f".repeat(64) } }, expansion))
      .toMatchObject({ ok: true, value: { inputSnapshot: { scanPlan: { cursorPresence: "PRESENT" } } } });
    for (const key of ["clockAt", "windowStart", "windowEnd"]) {
      const invalid = clone(input), day: Record<string, unknown> = invalid.days[0]!; delete day[key];
      expect(compiler.compile(invalid, expansion)).toMatchObject({ ok: false, error: { code: "MISSING_INPUT" } });
    }
    expect(compiler.compile({ ...input, scope: { ...input.scope, workspaceId: "" } }, expansion))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCOPE_OR_WINDOW" } });
    expect(compiler.compile({ ...input, bindingConfig: { query: " ", term: input.command.query } }, expansion).ok).toBe(true);
    expect(compiler.compile({ ...input, bindingConfig: { query: "different primary" } }, expansion))
      .toMatchObject({ ok: false, error: { code: "PARSER_OR_PLANNER_MISMATCH" } });
    expect(compiler.compile({ ...input, retained: [{ day: input.days[0]!.day, streamId: 3, pageLimit: 5, descriptorHash: "f".repeat(64) }] }, expansion))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCOPE_OR_WINDOW" } });
    const config = { ...input.configReader, searchQueryBudgets: [{ query: input.command.query, maxItems: { nested: 5 } }] };
    expect(compiler.compile({ ...input, configReader: config, effectiveConfig: config }, expansion))
      .toMatchObject({ ok: false, error: { code: "UNSUPPORTED_PROFILE" } });
  });
  it("rejects unsupported incident operators without rewriting the SDK's query semantics", () => {
    const { input, expansion } = fixtures[1]!;
    for (const operator of ["since:2020-01-01", "until:2020-01-02", "lang:ja", "min_faves:1", "filter:links"]) {
      const query = `synthetic ${operator}`, command = { ...input.command, query };
      expect(compiler.compile({ ...input, command, bindingConfig: { query }, scanPlan: { ...input.scanPlan, query: command } }, expansion))
        .toMatchObject({ ok: false, error: { code: "UNSUPPORTED_PROFILE", path: "searchQueries.overridingOperators" } });
    }
  });
});
