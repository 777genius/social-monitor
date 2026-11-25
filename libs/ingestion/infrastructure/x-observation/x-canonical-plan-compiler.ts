import type { SourceQueryPlan } from "../../domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { SourceProviderScanContext, SourceQuery } from "../../ports";
import { sourceBindingScanQuery } from "@social-monitor/monitoring/features/shared/source-binding-scan-query";
import { parseConfig, readPositiveInteger, readSearchQueries } from "../../adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-config";
import { DefaultSourceQueryPlanRuntimeCompiler, isSourceQueryPlannerEnabled } from "../../adapters/source/source-query-plan-runtime-compiler";
import { readSourceItemRankingPlan } from "../../adapters/source/source-item-ranking-config";
import { readAdaptivePaginationPolicy } from "../../adapters/source/adaptive-source-pagination";
import { resolveXQueryBudget, resolveXQueryTarget } from "../../domain/x-observation/x-canonical-query-budget";
import { snapshotXReceiptPredicate } from "../../domain/x-observation/x-canonical-predicate";
import type { CanonicalCompilerCapabilities, CanonicalPlanCompiler, CanonicalPlanInput, CanonicalSdkExpansion, ProposedCanonicalPlan } from "../../features/observe-retained-x/x-canonical-plan.contracts";
import { failure, proposedBounds, type CanonicalLane, type PlanRecord, type PlanningResult } from "../../domain/x-observation/x-canonical-graph-policy";
import { CanonicalInputError, exact, hashValid, readCanonicalPlanInput, requirePlan, snapshotPlan } from "./x-canonical-plan-input";

export class PureCanonicalPlanCompiler implements CanonicalPlanCompiler {
  private readonly capabilities: CanonicalCompilerCapabilities;
  constructor(capabilities: CanonicalCompilerCapabilities) {
    this.capabilities = Object.freeze({ ...capabilities, verifiedSourcePins: snapshotPlan(capabilities.verifiedSourcePins),
      verifiedSdkExpansionHashes: snapshotPlan(capabilities.verifiedSdkExpansionHashes) });
  }
  compile(raw: unknown, expansionRaw: unknown): PlanningResult<ProposedCanonicalPlan> {
    try {
      const input = readCanonicalPlanInput(raw), expansion = snapshotPlan(expansionRaw) as CanonicalSdkExpansion;
      const { digest, verifiedSourcePins } = this.capabilities;
      requirePlan(digest(input.sourcePins) === digest(verifiedSourcePins), "SOURCE_PIN_MISMATCH", "sourcePins");
      for (const source of ["libs/ingestion/infrastructure/x-observation/x-canonical-plan-compiler.ts",
        "libs/ingestion/infrastructure/x-observation/x-canonical-plan-input.ts", "libs/ingestion/domain/x-observation/x-canonical-graph-policy.ts",
        "libs/ingestion/features/observe-retained-x/x-canonical-plan.contracts.ts", "apps/x-collector/src/x_collector/canonical_graph_compiler.py",
        "apps/x-collector/src/x_collector/canonical_sdk_builders.py", "apps/x-collector/src/x_collector/search_plan.py",
        "apps/x-collector/src/x_collector/scweet_adapter.py", "apps/x-collector/src/x_collector/search_budget.py",
        "apps/x-collector/src/x_collector/config.py",
        "apps/x-collector/src/x_collector/domain.py",
        "libs/shared-kernel/src/ids.ts",
        "libs/monitoring/features/shared/source-binding-scan-query.ts",
        "libs/ingestion/domain/x-observation/x-canonical-predicate.ts",
        "libs/ingestion/domain/x-observation/x-canonical-query-budget.ts",
  "libs/ingestion/domain/x-observation/x-canonical-days.ts",
        "libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-config.ts",
        "libs/ingestion/adapters/source/source-query-plan-runtime-compiler.ts", "libs/ingestion/adapters/source/x-source-query-plan-runtime-budget.ts",
        "libs/ingestion/adapters/source/adaptive-source-pagination.ts", "libs/ingestion/adapters/source/source-item-ranking-config.ts",
        "libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider.ts",
        "libs/ingestion/infrastructure/x-observation/x-canonical-digest.ts"]) requirePlan(hashValid(verifiedSourcePins[source]), "MISSING_INPUT", "sourcePins.required");
      this.validateProfile(input.sdkProfile);
      exact(expansion, "invocations,profileHash", "", "sdkExpansion");
      requirePlan(this.capabilities.verifiedSdkExpansionHashes.includes(input.sdkExpansionHash),
        "SDK_EXPANSION_MISMATCH", "sdkExpansion.verifiedPreparation");
      requirePlan(digest(expansion) === input.sdkExpansionHash && expansion.profileHash === digest(input.sdkProfile), "SDK_EXPANSION_MISMATCH", "sdkExpansionHash");
      requirePlan(Array.isArray(expansion.invocations), "SDK_EXPANSION_MISMATCH", "invocations");
      const config = this.resolveConfig(input), lanes: CanonicalLane[] = [], settings: Record<string, PlanRecord> = {};
      requirePlan(readPositiveInteger(config.windowHours, 24, 1, 72) === 24,
        "UNSUPPORTED_PROFILE", "effectiveConfig.windowHours");
      for (const [index, day] of input.days.entries()) {
        requirePlan(index === 0 || Date.parse(day.windowStart) - Date.parse(input.days[index - 1]!.windowStart) === 86400000,
          "INVALID_SCOPE_OR_WINDOW", "days.order");
        const effective = { ...config, windowHours: 24, windowEnd: day.windowEnd,
          targetPublishedWindow: { start: day.windowStart, end: day.windowEnd } };
        const parsed = parseConfig({ query: input.scanPlan.query, maxItems: input.scanPlan.maxItems },
          { ...input.scope, tenantId: tenantId(input.scope.tenantId), workspaceId: workspaceId(input.scope.workspaceId),
            scanJobId: day.scanJobId, config: effective } satisfies SourceProviderScanContext, new Date(day.clockAt));
        const queries = uncappedQueries(input.scanPlan.query.query, effective);
        requirePlan(parsed.searchQueries.length === queries.length && parsed.searchQueries.every((q, i) => q === queries[i]), "QUERY_LOSS_OR_OVERFLOW", "searchQueries");
        requirePlan(queries.length === input.maxSearchQueries, "QUERY_LOSS_OR_OVERFLOW", "maxSearchQueries.exact");
        requirePlan(parsed.windowHours === 24 && parsed.windowEnd.toISOString() === day.windowEnd, "PARSER_OR_PLANNER_MISMATCH", "window");
        const adaptiveConfig = config.adaptivePagination as PlanRecord | null | undefined;
        const hydrated = adaptiveConfig ? { ...config, adaptivePagination: { ...adaptiveConfig,
          ...(adaptiveConfig.maxDuplicateRate === undefined ? {} : { maxDuplicateRate: Number(adaptiveConfig.maxDuplicateRate) }) } } : config;
        const pagination = readAdaptivePaginationPolicy({ config: hydrated, cursorModel: "none", firstPageLimit: input.scanPlan.maxItems, providerManagesPagination: true });
        const policy = pagination.enabled ? pagination.policy : undefined;
        const ranking = readSourceItemRankingPlan(effective, parsed.searchQueries);
        settings[day.day] = snapshotPlan({ targetPublishedWindow: effective.targetPublishedWindow,
          ranking: { mode: ranking.mode, queries: ranking.queries },
          adaptive: pagination.enabled ? { enabled: true, policy: pagination.policy } : { enabled: false },
          parsed: { ...parsed, language: parsed.language ?? null, limitPerProduct: parsed.limitPerProduct ?? null,
            minLikes: parsed.minLikes ?? null, minRetweets: parsed.minRetweets ?? null, minReplies: parsed.minReplies ?? null,
            windowEnd: parsed.windowEnd.toISOString(), maxItemsBySearchQuery: [...parsed.maxItemsBySearchQuery] } }) as unknown as PlanRecord;
        for (const [laneOrdinal, searchQuery] of parsed.searchQueries.entries()) {
          // Python IGNORECASE also folds dotted/dotless I; JS /iu already folds long S and Kelvin K.
          requirePlan(!/(?:^|[^A-Za-z0-9_])(?:lang|since|until|min_[a-z_]+|-?filter):/iu.test(searchQuery.replace(/[ıİ]/gu, "i")),
            "UNSUPPORTED_PROFILE", "searchQueries.overridingOperators");
          const budget = resolveXQueryBudget(parsed, searchQuery), target = resolveXQueryTarget(budget, queries.length, policy);
          const laneId = `${day.day}/l${laneOrdinal}`, invocationId = `${laneId}/i0`;
          const predicate = snapshotXReceiptPredicate({ searchQuery, requireQueryMatch: parsed.requireQueryMatch,
            ...(parsed.minLikes === undefined ? {} : { minLikes: parsed.minLikes }),
            ...(parsed.minRetweets === undefined ? {} : { minReposts: parsed.minRetweets }),
            ...(parsed.minReplies === undefined ? {} : { minReplies: parsed.minReplies }) });
          const request = { request_id: queries.length === 1 ? day.scanJobId : `${day.scanJobId}:${laneOrdinal + 1}:1`,
            tenant_id: input.scope.tenantId, workspace_id: input.scope.workspaceId, source_binding_id: input.scope.sourceBindingId,
            scan_job_id: day.scanJobId, correlation_id: input.scope.correlationId, query: searchQuery, language: parsed.language ?? null,
            window_hours: parsed.windowHours, window_end: day.windowEnd, search_products: parsed.searchProducts,
            limit_per_product: Math.min(100, parsed.limitPerProduct ?? budget), max_items: Math.min(target, budget),
            min_likes: parsed.minLikes ?? null, min_retweets: parsed.minRetweets ?? null, min_replies: parsed.minReplies ?? null, cursor: null };
          const invocation = expansion.invocations[lanes.length];
          requirePlan(invocation?.invocationId === invocationId && invocation.laneId === laneId && invocation.ordinal === 0 &&
            invocation.requestHash === digest(request), "SDK_EXPANSION_MISMATCH", "invocations.requestHash");
          this.validateInvocation(invocation, input, request);
          lanes.push({ day: day.day, laneOrdinal, laneId, searchQuery, budget, target, predicate, request, invocationIds: [invocationId] });
        }
      }
      requirePlan(expansion.invocations.length === lanes.length, "SDK_EXPANSION_MISMATCH", "invocations.length");
      const compilerManifestHash = digest(input.sourcePins);
      const bounds = proposedBounds(input.days.map((day) => day.day), expansion.invocations, input.retained, input.amendmentId, compilerManifestHash);
      if (!bounds.ok) return bounds;
      const output = { kind: "x-canonical-graph-plan" as const, planningVersion: 1 as const, releaseState: "PROPOSED" as const,
        evidenceMode: input.evidenceMode, productionGraphFrozen: false as const,
        unresolvedReleaseDependencies: ["E3_CAPTURE", "E4_ADMISSION", "NATIVE_MODEL_PARITY", "SEND_AMENDMENT"] as const,
        inputHash: digest(input), inputSnapshot: input, compilerManifestHash, lanes, invocations: expansion.invocations, retained: input.retained,
        resolvedSettings: settings, policy: { version: 1 as const, leaves: lanes.map(({ laneId, predicate }) => ({ laneId, predicate })),
          compilerManifestHash, rankingHash: digest(settings), boundsHash: digest(bounds.value) }, bounds: bounds.value };
      return { ok: true, value: snapshotPlan({ ...output, graphHash: digest(output) }) };
    } catch (error) {
      if (error instanceof CanonicalInputError) return failure(error.code, error.path);
      return failure("PARSER_OR_PLANNER_MISMATCH", "compiler");
    }
  }

  private resolveConfig(input: CanonicalPlanInput): PlanRecord {
    const { digest } = this.capabilities, runtime = { ...input.configReader, ...input.command.parameters };
    if (input.entrypoint === "binding-scan") {
      const built = sourceBindingScanQuery({ id: input.scope.sourceBindingId, providerKey: "x-twitter-experimental-daily", config: input.bindingConfig });
      requirePlan(built.mode === input.command.mode && built.query === input.command.query, "PARSER_OR_PLANNER_MISMATCH", "entrypoint.primary");
    }
    const enabled = isSourceQueryPlannerEnabled(runtime), branch = input.planner.branch;
    requirePlan(branch === "absent" ? !input.planner.injected : branch === "disabled" ? !enabled : enabled && input.planner.injected,
      "PARSER_OR_PLANNER_MISMATCH", "planner.branch");
    let sourceQuery: SourceQuery = input.command;
    if (branch === "compiled") {
      requirePlan(input.planner.plan !== null && input.planner.compilation !== null, "MISSING_INPUT", "planner.plan");
      exact(input.planner.plan, "plannerId,intent,warnings,lanes", "", "planner.plan");
      exact(input.planner.plan.intent, "topic,sourceKeys", "products,keywords,handles,communities,maxLanes,maxLanesPerSource,maxItemsPerLane,includeEnrichment", "planner.plan.intent");
      const intent = input.planner.plan.intent;
      for (const [key, value] of Object.entries(intent)) {
        if (["handles", "communities"].includes(key)) {
          requirePlan(Array.isArray(value), "MISSING_INPUT", "planner.intent.entries");
          for (const item of value) exact(item, key === "handles" ? "handle" : "name",
            key === "handles" ? "sourceKey,includePosts,includeMentions" : "sourceKey,listings", "planner.intent.entry");
        } else requirePlan(typeof value !== "object" || (Array.isArray(value) && value.every((item) => typeof item === "string")), "UNSUPPORTED_PROFILE", "planner.intent.value");
      }
      requirePlan(Array.isArray(input.planner.plan.lanes), "MISSING_INPUT", "planner.plan.lanes");
      for (const lane of input.planner.plan.lanes) {
        exact(lane, "laneId,sourceKey,kind,operation,query,priority,maxItems,reason", "parameters", "planner.plan.lane");
        requirePlan([lane.laneId, lane.sourceKey, lane.kind, lane.operation, lane.query, lane.reason].every((v) => typeof v === "string") &&
          Number.isSafeInteger(lane.priority) && Number.isSafeInteger(lane.maxItems), "UNSUPPORTED_PROFILE", "planner.plan.lane.values");
        if (lane.parameters !== undefined) {
          requirePlan(lane.parameters !== null && typeof lane.parameters === "object" && !Array.isArray(lane.parameters) &&
            Object.values(lane.parameters).every((v) => typeof v !== "object" || (Array.isArray(v) && v.every((item) => typeof item === "string"))), "UNSUPPORTED_PROFILE", "planner.plan.lane.parameters");
        }
      }
      const result = new DefaultSourceQueryPlanRuntimeCompiler().compile({ providerKey: "x-twitter-experimental-daily",
        originalSourceQuery: input.command, runtimeConfig: runtime, plan: input.planner.plan as unknown as SourceQueryPlan });
      requirePlan(!result.warnings.some((warning) => warning.includes("capped")), "QUERY_LOSS_OR_OVERFLOW", "planner.cap");
      requirePlan(digest(result) === digest(input.planner.compilation), "PARSER_OR_PLANNER_MISMATCH", "planner.compilation");
      sourceQuery = result.sourceQuery;
    } else requirePlan(input.planner.plan === null && input.planner.compilation === null, "PARSER_OR_PLANNER_MISMATCH", "planner.absence");
    const merged = { ...runtime, ...(sourceQuery.parameters ?? {}) };
    requirePlan(digest(merged) === digest(input.effectiveConfig) && digest(sourceQuery) === digest(input.scanPlan.query), "PARSER_OR_PLANNER_MISMATCH", "config.precedence");
    requirePlan(readPositiveInteger(merged.maxItems, 25, 1, 100) === input.scanPlan.maxItems, "PARSER_OR_PLANNER_MISMATCH", "scanPlan.maxItems");
    const nested = (merged.queryPlan ?? merged.queryLanes) as PlanRecord | undefined;
    requirePlan(merged.maxSearchQueries === input.maxSearchQueries && (nested?.maxQueries == null || nested.maxQueries === input.maxSearchQueries), "QUERY_LOSS_OR_OVERFLOW", "config.cap");
    return merged;
  }

  private validateProfile(profile: PlanRecord): void {
    exact(profile, "nSplits,minIntervalSeconds,apiPageSize,pageSizeHint,pageSizeHintSource,maxEmptyPages,concurrency,profileHash,operationManifestHash,queryId,endpoint,features,fieldToggles", "", "sdkProfile");
    for (const key of ["nSplits", "minIntervalSeconds", "maxEmptyPages", "concurrency"]) requirePlan(
      Number.isSafeInteger(profile[key]) && Number(profile[key]) > 0, "UNSUPPORTED_PROFILE", `sdkProfile.${key}`);
    requirePlan(Number(profile.nSplits) <= 24 && Number(profile.maxEmptyPages) <= 10, "UNSUPPORTED_PROFILE", "sdkProfile.collectorBounds");
    requirePlan(profile.apiPageSize === 20 && profile.pageSizeHint === 20 && profile.pageSizeHintSource === "runner-config", "UNSUPPORTED_PROFILE", "sdkProfile.pageSizeHint");
    for (const key of ["features", "fieldToggles"]) requirePlan(profile[key] === null ||
      (typeof profile[key] === "object" && !Array.isArray(profile[key]) && Object.values(profile[key]).every((v) => typeof v === "boolean")), "UNSUPPORTED_PROFILE", `sdkProfile.${key}`);
    requirePlan(typeof profile.queryId === "string" && !!profile.queryId.trim() && typeof profile.endpoint === "string" && !!profile.endpoint.trim(), "MISSING_INPUT", "sdkProfile.operation");
    const { profileHash, operationManifestHash, ...publicProfile } = profile;
    requirePlan(profileHash === this.capabilities.digest(publicProfile) && operationManifestHash === this.capabilities.digest({
      queryId: profile.queryId, endpoint: profile.endpoint, features: profile.features, fieldToggles: profile.fieldToggles }), "SDK_EXPANSION_MISMATCH", "sdkProfile.hashes");
  }

  private validateInvocation(invocation: CanonicalSdkExpansion["invocations"][number], input: CanonicalPlanInput, request: PlanRecord): void {
    const { digest, utf8Digest } = this.capabilities;
    exact(invocation, "invocationId,laneId,ordinal,requestHash,request,continuationPolicy,passes", "", "invocation");
    requirePlan(digest(invocation.request) === digest(request), "SDK_EXPANSION_MISMATCH", "invocation.request");
    requirePlan(invocation.continuationPolicy === "canonical-no-external-cursor-at-source-pin" && Array.isArray(invocation.passes), "SDK_EXPANSION_MISMATCH", "invocation.continuation");
    requirePlan(invocation.passes.length === 3, "SDK_EXPANSION_MISMATCH", "invocation.passes");
    const minimums = [request.min_likes, request.min_retweets, request.min_replies] as (number | null)[];
    const expectedMinimums = [minimums, minimums.map((v, i) => v === null ? [50, 10, 5][i]! : Math.max(v * 3, [50, 10, 5][i]!)),
      minimums.map((v, i) => v === null ? null : Math.min(v, [5, 1, 1][i]!))];
    for (const [ordinal, pass] of invocation.passes.entries()) {
      exact(pass, "passId,ordinal,label,product,limit,minLikes,minRetweets,minReplies,globalStopScope,stopRuleSourceHash,budgetSelectionSourceHash,streams", "", "pass");
      requirePlan(pass.stopRuleSourceHash === "3ea37e6163dd8c046ee4c4566ab7dfc74b66f6556288eaaac79d7d985c0b32d4" &&
        pass.budgetSelectionSourceHash === input.sourcePins["apps/x-collector/src/x_collector/search_budget.py"] && Array.isArray(pass.streams), "SOURCE_PIN_MISMATCH", "pass.sourcePins");
      requirePlan(pass.label === ["top_base", "top_strict", "latest_discovery"][ordinal] && pass.product === (ordinal === 2 ? "latest" : "top") &&
        pass.limit === request.limit_per_product && digest([pass.minLikes, pass.minRetweets, pass.minReplies]) === digest(expectedMinimums[ordinal]), "SDK_EXPANSION_MISMATCH", "pass.plan");
      const splitCount = Math.min(Number(input.sdkProfile.nSplits), Math.max(1, Math.floor(86399 / Number(input.sdkProfile.minIntervalSeconds))));
      requirePlan(pass.streams.length === splitCount, "SDK_EXPANSION_MISMATCH", "pass.splitCount");
      for (const [split, stream] of pass.streams.entries()) {
        exact(stream, "streamId,passId,splitOrdinal,splitWindow,rawQuery,rawQueryHash,normalizedRequestHash,parametersWithoutCursor,parametersHash,publicUrl,profileHash,product,pageLimit", "", "stream");
        exact(stream.splitWindow, "since,until", "", "stream.splitWindow");
        exact(stream.parametersWithoutCursor, "variables,features", "fieldToggles", "stream.parameters");
        requirePlan(typeof stream.rawQuery === "string" && typeof stream.splitWindow.since === "string" &&
          typeof stream.splitWindow.until === "string" && typeof stream.parametersWithoutCursor.variables === "string" &&
          typeof stream.parametersWithoutCursor.features === "string" && (stream.parametersWithoutCursor.fieldToggles === undefined ||
          typeof stream.parametersWithoutCursor.fieldToggles === "string"), "SDK_EXPANSION_MISMATCH", "stream.scalarTypes");
        const variables: unknown = JSON.parse(stream.parametersWithoutCursor.variables!);
        exact(variables, "rawQuery,count,querySource,product,withGrokTranslatedBio", "", "stream.variables");
        requirePlan(variables.count === 20 && variables.querySource === "typed_query" && variables.withGrokTranslatedBio === false &&
          variables.rawQuery === stream.rawQuery && variables.product === stream.product && stream.profileHash === input.sdkProfile.profileHash &&
          digest(stream.parametersWithoutCursor) === stream.parametersHash && utf8Digest(stream.rawQuery) === stream.rawQueryHash && hashValid(stream.normalizedRequestHash),
        "SDK_EXPANSION_MISMATCH", "stream.hashes");
        requirePlan(stream.splitWindow.since.startsWith(invocation.invocationId.slice(0, 10)) && stream.splitWindow.until.startsWith(invocation.invocationId.slice(0, 10)), "SDK_EXPANSION_MISMATCH", "stream.window");
        const timestamp = (boundary: number) => new Date(Date.parse(`${invocation.invocationId.slice(0, 10)}T00:00:00.000Z`) +
          Math.floor(boundary * 86399 / splitCount) * 1000).toISOString().replace("T", "_").replace(".000Z", "_UTC");
        requirePlan(stream.splitWindow.since === timestamp(split) && stream.splitWindow.until === timestamp(split + 1) &&
          stream.product === (pass.product === "top" ? "Top" : "Latest") &&
          stream.publicUrl === String(input.sdkProfile.endpoint).replace("{query_id}", String(input.sdkProfile.queryId)), "SDK_EXPANSION_MISMATCH", "stream.profile");
        requirePlan(digest(JSON.parse(stream.parametersWithoutCursor.features!)) === digest(input.sdkProfile.features ?? {}) &&
          digest(stream.parametersWithoutCursor.fieldToggles === undefined ? {} : JSON.parse(stream.parametersWithoutCursor.fieldToggles)) === digest(input.sdkProfile.fieldToggles ?? {}), "SDK_EXPANSION_MISMATCH", "stream.manifest");
      }
    }
  }
}

// Use the unchanged parser on bounded slices to expose every local lane beyond its hard cap16.
function uncappedQueries(primary: string, config: PlanRecord): readonly string[] {
  const nested = (config.queryPlan ?? config.queryLanes ?? {}) as PlanRecord;
  const strings = (...values: unknown[]) => [...new Set(values.flatMap((value) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim()) : []))];
  const terms = strings(nested.productTerms, nested.terms, config.queryLaneProductTerms, config.productTerms, config.entityTerms);
  const handles = strings(nested.handles, config.queryLaneHandles, config.trackedHandles, config.handles);
  const queries = [primary.trim(), ...strings(config.searchQueries ?? config.queries)];
  for (let index = 0; index < terms.length; index += 3) queries.push(...readSearchQueries(primary,
    { queryPlan: { productTerms: terms.slice(index, index + 3), includeFallbackQuery: false, maxQueries: 16 } }).slice(1));
  const validHandles = handles.filter((handle) => /^[a-zA-Z0-9_]{1,15}$/u.test(handle.replace(/^@/u, "")));
  for (const mode of ["includeFromLanes", "includeMentionLanes"] as const) {
    if ((nested[mode] ?? config[mode] ?? (validHandles.length > 0)) === true) for (const handle of validHandles) {
      queries.push(...readSearchQueries(primary, { queryPlan: { handles: [handle], includeFromLanes: mode === "includeFromLanes",
        includeMentionLanes: mode === "includeMentionLanes", includeFallbackQuery: false, maxQueries: 16 } }).slice(1));
    }
  }
  if ((nested.includeFallbackQuery ?? config.includeFallbackQuery ?? (terms.length > 0 || validHandles.length > 0)) === true) {
    queries.push(...readSearchQueries(primary, { queryPlan: { includeFallbackQuery: true, maxQueries: 16 } }).slice(1));
  }
  return [...new Set(queries.filter(Boolean))];
}
