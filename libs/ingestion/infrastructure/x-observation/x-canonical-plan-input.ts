import type { CanonicalPlanInput } from "../../features/observe-retained-x/x-canonical-plan.contracts";
import type { PlanningFailureCode } from "../../domain/x-observation/x-canonical-graph-policy";
import { xDays } from "../../domain/x-observation/x-canonical-days";

export class CanonicalInputError extends Error {
  constructor(readonly code: PlanningFailureCode, readonly path: string) { super(`${code}:${path}`); }
}
export function requirePlan(condition: unknown, code: PlanningFailureCode, path: string): asserts condition {
  if (!condition) throw new CanonicalInputError(code, path);
}
export function exact(value: unknown, required: string, optional = "", path = "input"): asserts value is Record<string, unknown> {
  requirePlan(value !== null && typeof value === "object" && !Array.isArray(value), "MISSING_INPUT", path);
  const needs = required.split(",").filter(Boolean), allowed = [...needs, ...optional.split(",")];
  const missing = needs.find((key) => !Object.hasOwn(value, key));
  requirePlan(missing === undefined, "MISSING_INPUT", `${path}.${missing}`);
  requirePlan(Object.keys(value).every((key) => allowed.includes(key)), "UNSUPPORTED_PROFILE", `${path}.unknownField`);
}
export const hashValid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export const textValid = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export const timeValid = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function decimalRatio(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  const [mantissa, exponent] = text.split("e");
  return `0.${"0".repeat(-Number(exponent) - 1)}${mantissa!.replace(".", "")}`;
}

export function snapshotPlan<T>(input: T): T {
  const seen = new Set<object>();
  function copy(value: unknown, path: string): unknown {
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") {
      requirePlan(!Object.is(value, -0), "UNSUPPORTED_PROFILE", path);
      if (path.endsWith(".maxDuplicateRate") && Number.isFinite(value) && value >= 0 && value <= 1) return decimalRatio(value);
      requirePlan(Number.isSafeInteger(value), "BOUNDS_OVERFLOW", path); return value;
    }
    requirePlan(typeof value === "object" && value !== null, "UNSUPPORTED_PROFILE", path);
    requirePlan(!seen.has(value) && Object.getOwnPropertySymbols(value).length === 0, "UNSUPPORTED_PROFILE", path);
    requirePlan(Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype), "UNSUPPORTED_PROFILE", path);
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value), result: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(value) && key === "length") continue;
      requirePlan("value" in descriptor && descriptor.enumerable && key !== "__proto__", "UNSUPPORTED_PROFILE", path);
      const field = /^[A-Za-z_][A-Za-z0-9_]{0,63}$|^\d+$/u.test(key) ? key : "entry";
      Object.defineProperty(result, key, { value: copy(descriptor.value, `${path}.${field}`), enumerable: true });
    }
    seen.delete(value);
    if (Array.isArray(value)) {
      requirePlan(Object.keys(result).length === value.length && Object.keys(result).every((key, i) => key === String(i)), "UNSUPPORTED_PROFILE", path);
      return Object.freeze(Object.values(result));
    }
    return Object.freeze(result);
  }
  return copy(input, "input") as T;
}

const configKeys = "query,term,topic,subreddit,mode,maxItems,maxItemsPerQuery,maxItemsPerSearchQuery,maxItemsPerLane,searchQueries,queries,maxSearchQueries,searchQueryBudgets,searchQueryMaxItems,queryPlan,queryLanes,queryLaneHandles,trackedHandles,handles,queryLaneProductTerms,productTerms,entityTerms,includeFromLanes,includeMentionLanes,includeFallbackQuery,language,windowHours,windowEnd,searchProducts,limitPerProduct,minLikes,minRetweets,minReplies,requireQueryMatch,sourceQueryPlanner,enableSourceQueryPlanner,targetPublishedWindow,rankingQueries,sourceRankingQueries,rankingQuery,sourceRankingQuery,sourceRankingMode,rankingMode,adaptivePagination,products,queryLaneKeywords,keywords,maxQueryPlannerLanes,maxLanesPerSource,includeQueryPlannerEnrichment";
const nestedKeys: Record<string, string> = {
  queryPlan: "maxQueries,productTerms,terms,handles,includeFromLanes,includeMentionLanes,includeFallbackQuery",
  queryLanes: "maxQueries,productTerms,terms,handles,includeFromLanes,includeMentionLanes,includeFallbackQuery",
  adaptivePagination: "enabled,targetItems,maxPages,minNewItemsPerPage,maxDuplicateRate",
  targetPublishedWindow: "start,end",
  sourceQueryPlanner: "enabled,topic,products,productTerms,terms,keywords,keywordTerms,handles,accounts,communities,subreddits,maxLanes,maxLanesPerSource,maxItemsPerLane,includeEnrichment,maxSearchQueries",
};
export function validateConfig(value: unknown, path: string): void {
  exact(value, "", configKeys, path);
  for (const [key, child] of Object.entries(value)) {
    if (child === null) continue;
    if (nestedKeys[key]) {
      exact(child, "", nestedKeys[key], `${path}.${key}`);
      if (key === "adaptivePagination" && child.maxDuplicateRate !== undefined) requirePlan(
        typeof child.maxDuplicateRate === "string" && Number(child.maxDuplicateRate) >= 0 && Number(child.maxDuplicateRate) <= 1 &&
        decimalRatio(Number(child.maxDuplicateRate)) === child.maxDuplicateRate, "UNSUPPORTED_PROFILE", `${path}.adaptivePagination.maxDuplicateRate`);
      if (key === "sourceQueryPlanner") for (const [name, list] of Object.entries(child)) {
        if (["accounts", "handles", "communities", "subreddits"].includes(name) && Array.isArray(list)) {
          for (const item of list) if (typeof item !== "string") exact(item, "",
            ["accounts", "handles"].includes(name) ? "handle,sourceKey,includePosts,includeMentions" : "name,sourceKey,listings", `${path}.plannerEntry`);
        }
      }
      for (const [name, item] of Object.entries(child)) {
        const entries = key === "sourceQueryPlanner" && ["accounts", "handles", "communities", "subreddits"].includes(name);
        const entryValid = (entry: unknown): boolean => typeof entry === "string" || (entries && entry !== null && typeof entry === "object" &&
          Object.values(entry).every((v) => v === null || typeof v !== "object" || (Array.isArray(v) && v.every((s) => typeof s === "string"))));
        requirePlan(item === null || typeof item !== "object" || (Array.isArray(item) && item.every(entryValid)),
          "UNSUPPORTED_PROFILE", `${path}.nestedValue`);
      }
    } else if (["searchQueryBudgets", "searchQueryMaxItems"].includes(key)) {
      if (Array.isArray(child)) for (const item of child) {
        exact(item, "query", "maxItems,maxItemsPerQuery", `${path}.budget`);
        requirePlan(textValid(item.query) && Object.values(item).every((v) => v === null || typeof v === "string" || typeof v === "number"),
          "UNSUPPORTED_PROFILE", `${path}.budget.values`);
      }
      else requirePlan(typeof child === "object" && Object.values(child).every((v) => typeof v === "number" || typeof v === "string"), "UNSUPPORTED_PROFILE", `${path}.budgets`);
    } else requirePlan(typeof child !== "object" || (Array.isArray(child) && child.every((v) => typeof v === "string")), "UNSUPPORTED_PROFILE", `${path}.configValue`);
  }
}

export function readCanonicalPlanInput(raw: unknown): CanonicalPlanInput {
  const value = snapshotPlan(raw);
  exact(value, "base,evidenceMode,inputEvidence,sourcePins,scope,entrypoint,bindingConfig,command,configReader,planner,scanPlan,effectiveConfig,maxSearchQueries,amendmentId,days,sdkProfile,sdkExpansionHash,retained,acceptedSiblingHashes");
  requirePlan(value.base === "429e0f229c50f596d708216708775456b788251b", "SOURCE_PIN_MISMATCH", "base");
  requirePlan(["SYNTHETIC", "DEPLOYMENT"].includes(String(value.evidenceMode)), "MISSING_INPUT", "evidenceMode");
  exact(value.scope, "tenantId,workspaceId,sourceBindingId,interestId,scanPolicyId,correlationId", "", "scope");
  requirePlan(Object.values(value.scope).every(textValid), "INVALID_SCOPE_OR_WINDOW", "scope");
  requirePlan(["binding-scan", "recorded-command"].includes(String(value.entrypoint)), "MISSING_INPUT", "entrypoint");
  for (const key of ["bindingConfig", "configReader", "effectiveConfig"]) validateConfig(value[key], key);
  exact(value.command, "mode,query,parameters", "", "command");
  requirePlan(value.command.mode === "search" && textValid(value.command.query), "MISSING_INPUT", "command.query");
  validateConfig(value.command.parameters, "command.parameters");
  exact(value.scanPlan, "query,maxItems,cursorPresence,cursorHash", "", "scanPlan");
  exact(value.scanPlan.query, "mode,query,parameters", "", "scanPlan.query");
  validateConfig(value.scanPlan.query.parameters, "scanPlan.query.parameters");
  requirePlan(value.scanPlan.query.mode === "search" && textValid(value.scanPlan.query.query), "MISSING_INPUT", "scanPlan.query.query");
  requirePlan((value.scanPlan.cursorPresence === "ABSENT" && value.scanPlan.cursorHash === null) ||
    (value.scanPlan.cursorPresence === "PRESENT" && hashValid(value.scanPlan.cursorHash)), "MISSING_INPUT", "scanPlan.cursor");
  exact(value.planner, "branch,injected,plan,compilation", "", "planner");
  requirePlan(["disabled", "absent", "degraded", "compiled"].includes(String(value.planner.branch)) && typeof value.planner.injected === "boolean", "MISSING_INPUT", "planner.branch");
  requirePlan(Array.isArray(value.days) && value.days.length === 7, "MISSING_INPUT", "days");
  for (const day of value.days) {
    exact(day, "day,cellId,clockAt,windowStart,windowEnd,targetItems,scanJobId,predecessorHash", "", "days.item");
    requirePlan(timeValid(day.clockAt) && timeValid(day.windowStart) && timeValid(day.windowEnd) &&
      day.windowStart === `${day.day}T00:00:00.000Z` && Date.parse(day.windowEnd) - Date.parse(day.windowStart) === 86400000 &&
      day.targetItems === 100 && textValid(day.cellId) && textValid(day.scanJobId) && hashValid(day.predecessorHash), "INVALID_SCOPE_OR_WINDOW", "days.item");
  }
  requirePlan(value.days.every((day, i) => day.day === xDays[i]) && new Set(value.days.map((d) => d.cellId)).size === 7 &&
    new Set(value.days.map((d) => d.scanJobId)).size === 7, "INVALID_SCOPE_OR_WINDOW", "days.coordinates");
  requirePlan(Array.isArray(value.inputEvidence) && value.inputEvidence.length > 0, "MISSING_INPUT", "inputEvidence");
  for (const evidence of value.inputEvidence) {
    exact(evidence, "kind,provenance,sha256,observedAt", "", "inputEvidence.item");
    requirePlan(textValid(evidence.kind) && hashValid(evidence.sha256) && timeValid(evidence.observedAt) &&
      ["CURRENT", "FROZEN", "SYNTHETIC"].includes(String(evidence.provenance)), "MISSING_INPUT", "inputEvidence.item");
  }
  requirePlan(value.evidenceMode === "SYNTHETIC" || value.inputEvidence.every((e) => e.provenance === "FROZEN"), "MISSING_INPUT", "inputEvidence.frozenAuthority");
  requirePlan(value.sourcePins !== null && typeof value.sourcePins === "object" && !Array.isArray(value.sourcePins) &&
    Object.keys(value.sourcePins).length > 0 && Object.values(value.sourcePins).every(hashValid), "MISSING_INPUT", "sourcePins");
  requirePlan(hashValid(value.sdkExpansionHash), "MISSING_INPUT", "sdkExpansionHash");
  requirePlan(Number.isSafeInteger(value.maxSearchQueries) && Number(value.maxSearchQueries) >= 1 && Number(value.maxSearchQueries) <= 16, "QUERY_LOSS_OR_OVERFLOW", "maxSearchQueries");
  requirePlan(textValid(value.amendmentId), "UNAPPROVED_AMENDMENT", "amendmentId");
  requirePlan(Array.isArray(value.retained) && Array.isArray(value.acceptedSiblingHashes) && value.acceptedSiblingHashes.every(hashValid), "MISSING_INPUT", "retained");
  for (const item of value.retained) {
    exact(item, "day,streamId,pageLimit,descriptorHash", "", "retained.item");
    requirePlan(typeof item.day === "string" && textValid(item.streamId) && item.pageLimit === 5 && hashValid(item.descriptorHash),
      "INVALID_SCOPE_OR_WINDOW", "retained.item");
  }
  return value as unknown as CanonicalPlanInput;
}
