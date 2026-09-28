/** Offline HN verifier; the opt-in writer requires injected domain persistence and a one-shot journal. */
import { createHash } from "node:crypto";
import { open, readFile, rename } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { readScanPasses } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-scan-pass-support";
import { readPositiveInteger } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source-window";
import { NoopScanExecutionReporterAdapter } from "@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import { noopSourceItemEnrichment,
  type ConversationProjectionPort, type FeedProjectionPort, type FetchSourceItemsCommand,
  type FetchedSourceItem, type ScanAttemptRepositoryPort, type ScanLeasePort,
  type SourceFetcherPort, type SourceItemRepositoryPort, type SourceRuntimeConfig } from "@social-monitor/ingestion/ports";
import type { Clock, IdGenerator, TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const dayPattern = /^2026-09-(2[0-7])$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const idPattern = /^hn:([1-9][0-9]*)$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const journalFileName = "hn-verified-remainder-2026-09-20_27.journal.json";

export type PinnedDayArtifact = {
  readonly day: string;
  readonly manifestBytes: Buffer;
  readonly itemsBytes: Buffer;
  readonly expectedManifestSha256: string;
};

export type VerifiedRemainderInput = {
  readonly bindingBytes: Buffer;
  readonly expectedBindingSha256: string;
  readonly days: readonly PinnedDayArtifact[];
};

export type VerifiedCandidate = {
  readonly day: string;
  readonly externalId: string;
  readonly item: Readonly<Record<string, unknown>>;
  readonly provenance: readonly number[];
};

export type VerifiedRemainderPlan = {
  readonly schemaVersion: 1;
  readonly coverage: "PARTIAL_SOURCE_ONLY";
  readonly bindingId: string;
  readonly bindingSha256: string;
  readonly bindingQuery: string;
  readonly days: readonly {
    readonly day: string;
    readonly manifestSha256: string;
    readonly itemsSha256: string;
    readonly aggregateStatus: "incomplete";
    readonly completePasses: number;
    readonly incompletePasses: number;
    readonly incompletePassIndices: readonly number[];
    readonly candidateCount: number;
    readonly finalCapExceeded: boolean;
    readonly verifiedCandidates: number;
    readonly excludedIncompleteOnly: number;
    readonly excludedUnverifiableComment: number;
    readonly excludedOutOfDay: number;
  }[];
  readonly candidates: readonly VerifiedCandidate[];
  readonly planSha256: string;
};

function record(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !fields.includes(key))) throw new Error(`${label} has unknown fields`);
  return row;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a nonempty string`);
  return value;
}

function integer(value: unknown, label: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be an integer >= ${min}`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`${label} must be a string array`);
  return value as string[];
}

function parseJson(bytes: Buffer, label: string, exporterFormat = false): unknown {
  const source = bytes.toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch { throw new Error(`${label} is not valid JSON`); }
  if (exporterFormat && source !== `${JSON.stringify(parsed, null, 2)}\n`) {
    throw new Error(`${label} is not exact exporter JSON (duplicate keys or altered encoding)`);
  }
  return parsed;
}

function checkDigest(actual: string, expected: string, label: string): void {
  if (!digestPattern.test(expected) || actual !== expected) throw new Error(`${label} SHA-256 mismatch`);
}

function dayWindow(day: string): { from: string; to: string; fromMs: number; toMs: number } {
  if (!dayPattern.test(day)) throw new Error("Only 2026-09-20 through 2026-09-27 UTC days are allowed");
  const fromMs = Date.parse(`${day}T00:00:00.000Z`);
  const toMs = fromMs + 86_400_000;
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), fromMs, toMs };
}

function readBinding(bytes: Buffer): { bindingId: string; config: SourceRuntimeConfig } {
  const parsed = parseJson(bytes, "binding");
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error("Exactly one sanitized binding is required");
  const binding = record(parsed[0], "binding", ["bindingId", "status", "config"]);
  if (binding.status !== "ENABLED") throw new Error("Binding must be ENABLED");
  const bindingId = requiredString(binding.bindingId, "bindingId");
  const config = record(binding.config, "binding config", ["mode", "query", "maxItems", "scanPasses", "maxItemAgeHours"]);
  if (config.mode !== "search") throw new Error("Binding mode must be search");
  requiredString(config.query, "binding query");
  if (config.maxItemAgeHours !== undefined) integer(config.maxItemAgeHours, "maxItemAgeHours", 1);
  if (!Array.isArray(config.scanPasses) || config.scanPasses.length !== 28) throw new Error("Exactly 28 configured passes are required");
  for (const [index, raw] of config.scanPasses.entries()) {
    record(raw, `binding pass ${index}`, ["mode", "listing", "query", "target", "maxItems", "requiredKeywords",
      "requiredStoryKeywords", "includeComments", "maxCommentedStories", "maxCommentsPerPost", "commentDepth"]);
  }
  const typed = config as unknown as SourceRuntimeConfig;
  if (readScanPasses(typed).length !== 28) throw new Error("Configured pass count changed");
  return { bindingId, config: typed };
}

function passSource(mode: string, target: string, listing: string | undefined): string {
  return mode === "listing" ? requiredString(listing, "listing") : `${target}_search`;
}

function validatePasses(raw: unknown, config: SourceRuntimeConfig, window: ReturnType<typeof dayWindow>): {
  passes: readonly { index: number; status: "complete" | "incomplete"; returnedIds: string[];
    source: string; searchQuery?: string }[]; complete: number; commentCoverage: string;
} {
  if (!Array.isArray(raw) || raw.length !== 28) throw new Error("Manifest must contain all 28 pass attempts");
  const configured = readScanPasses(config);
  const finalCap = readPositiveInteger(config.maxItems, 30, 1, 100);
  const fallbackCap = Math.max(1, Math.ceil(finalCap / 28));
  const passes = raw.map((value: unknown, index: number) => {
    const pass = record(value, `manifest pass ${index}`, ["index", "window", "mode", "target", "query", "maxItems",
      "status", "returnedIds", "returnedCommentIds", "warnings", "error"]);
    const expected = configured[index]!;
    const span = record(pass.window, `pass ${index} window`, ["from", "to"]);
    const target = expected.mode === "listing" ? "story" : expected.target;
    const query = expected.mode === "listing"
      ? (expected.requiredKeywords === undefined ? config.query : expected.requiredKeywords.join(" "))
      : expected.query;
    if (pass.index !== index || span.from !== window.from || span.to !== window.to ||
      pass.mode !== expected.mode || pass.target !== target || pass.query !== query ||
      pass.maxItems !== (expected.maxItems ?? fallbackCap)) throw new Error(`Pass ${index} does not match day/binding`);
    if (pass.status !== "complete" && pass.status !== "incomplete") throw new Error(`Pass ${index} has invalid status`);
    const warnings = stringArray(pass.warnings, `pass ${index} warnings`);
    const returnedIds = stringArray(pass.returnedIds, `pass ${index} returnedIds`);
    if (pass.returnedCommentIds !== undefined) {
      const commentIds = stringArray(pass.returnedCommentIds, `pass ${index} returnedCommentIds`);
      if (commentIds.some((id) => !idPattern.test(id)) ||
        commentIds.join("\0") !== [...commentIds].sort().join("\0")) {
        throw new Error(`Pass ${index} returnedCommentIds are malformed or unsorted`);
      }
    }
    if (returnedIds.some((id) => !idPattern.test(id)) || returnedIds.join("\0") !== [...returnedIds].sort().join("\0")) {
      throw new Error(`Pass ${index} returnedIds are malformed or unsorted`);
    }
    if (pass.error !== undefined) requiredString(pass.error, `pass ${index} error`);
    if (pass.status === "complete" && (warnings.length !== 0 || pass.error !== undefined ||
      returnedIds.length > (pass.maxItems as number))) throw new Error(`Pass ${index} falsely claims complete`);
    if (pass.status === "incomplete" && warnings.length === 0 && pass.error === undefined) {
      throw new Error(`Pass ${index} has unexplained incomplete status`);
    }
    return { index, status: pass.status as "complete" | "incomplete", returnedIds,
      source: passSource(expected.mode, target, expected.mode === "listing" ? expected.listing : undefined),
      ...(expected.mode === "search" ? { searchQuery: expected.query } : {}) };
  });
  const complete = passes.filter((pass) => pass.status === "complete").length;
  const commentPasses = passes.filter((pass) => pass.source === "comment_search");
  const commentCoverage = commentPasses.length === 0 ? "UNKNOWN"
    : commentPasses.every((pass) => pass.status === "complete") ? "FETCHED" : "INCOMPLETE";
  return { passes, complete, commentCoverage };
}

function validateItem(value: unknown, label: string): Readonly<Record<string, unknown>> {
  const item = record(value, label, ["externalId", "canonicalUrl", "title", "body", "authorHandle", "publishedAt",
    "publishedAtUnixSeconds", "metadata"]);
  const id = requiredString(item.externalId, `${label} externalId`);
  const idMatch = idPattern.exec(id);
  if (idMatch === null || !Number.isSafeInteger(Number(idMatch[1]))) throw new Error(`${label} has invalid HN ID`);
  if (item.canonicalUrl !== `https://news.ycombinator.com/item?id=${idMatch[1]}`) throw new Error(`${label} has noncanonical URL`);
  if (typeof item.title !== "string" || typeof item.body !== "string" ||
    (item.authorHandle !== undefined && typeof item.authorHandle !== "string")) throw new Error(`${label} is not a normalized story`);
  const publishedAt = requiredString(item.publishedAt, `${label} publishedAt`);
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms <= 0 || new Date(ms).toISOString() !== publishedAt ||
    item.publishedAtUnixSeconds !== ms / 1000) throw new Error(`${label} has an invalid normalized timestamp`);
  const metadata = record(item.metadata, `${label} metadata`, ["kind", "source", "searchQuery", "externalUrl", "points", "comments"]);
  if (metadata.kind !== "hacker_news_story" || typeof metadata.source !== "string" ||
    (metadata.searchQuery !== undefined && typeof metadata.searchQuery !== "string") ||
    (metadata.externalUrl !== undefined && typeof metadata.externalUrl !== "string") ||
    (metadata.points !== undefined && (typeof metadata.points !== "number" || !Number.isSafeInteger(metadata.points) || metadata.points < 0)) ||
    (metadata.comments !== undefined && (typeof metadata.comments !== "number" || !Number.isSafeInteger(metadata.comments) || metadata.comments < 0))) {
    throw new Error(`${label} is not normalized HN adapter output`);
  }
  return item;
}

function validateComment(value: unknown, label: string): void {
  const unit = record(value, label, ["rootExternalId", "rootProviderItemId", "providerUnitId", "canonicalUrl", "body",
    "authorHandle", "publishedAt", "publishedAtUnixSeconds", "threadExternalId", "parentProviderUnitId", "depth", "role", "metadata"]);
  const id = requiredString(unit.providerUnitId, `${label} providerUnitId`);
  if (!idPattern.test(id) || unit.canonicalUrl !== `https://news.ycombinator.com/item?id=${id.slice(3)}` ||
    !idPattern.test(String(unit.rootExternalId)) || unit.threadExternalId !== unit.rootExternalId ||
    unit.rootProviderItemId !== String(unit.rootExternalId).slice(3) || typeof unit.body !== "string" ||
    (unit.authorHandle !== undefined && typeof unit.authorHandle !== "string") ||
    (unit.parentProviderUnitId !== undefined && !idPattern.test(String(unit.parentProviderUnitId))) ||
    typeof unit.depth !== "number" || !Number.isSafeInteger(unit.depth) || unit.depth < 0 ||
    unit.role !== (unit.depth === 0 ? "top_level_comment" : "reply")) throw new Error(`${label} is malformed`);
  const ms = Date.parse(requiredString(unit.publishedAt, `${label} publishedAt`));
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== unit.publishedAt || unit.publishedAtUnixSeconds !== ms / 1000) {
    throw new Error(`${label} has invalid timestamp`);
  }
  const metadata = record(unit.metadata, `${label} metadata`, ["kind", "contentType", "source", "searchQuery",
    "rootProviderItemId", "storyId", "parentId", "storyTitle", "score", "providerScore", "rank", "replies",
    "replyCount", "depth", "role", "signalQuality", "scoreConfidence", "rankConfidence"]);
  if (metadata.kind !== "hacker_news_comment" || metadata.contentType !== "comment" ||
    typeof metadata.source !== "string" ||
    (metadata.searchQuery !== undefined && typeof metadata.searchQuery !== "string") ||
    metadata.rootProviderItemId !== unit.rootProviderItemId ||
    metadata.storyId !== Number(unit.rootProviderItemId) ||
    metadata.depth !== unit.depth || metadata.role !== unit.role ||
    metadata.signalQuality !== "normal" && metadata.signalQuality !== "low" ||
    metadata.scoreConfidence !== "not_available" && metadata.scoreConfidence !== "provider_reported" ||
    !Number.isSafeInteger(metadata.replies) || (metadata.replies as number) < 0 ||
    metadata.replyCount !== metadata.replies) throw new Error(`${label} is not HN comment output`);
}

function validateDay(artifact: PinnedDayArtifact, binding: ReturnType<typeof readBinding>, bindingSha256: string) {
  const window = dayWindow(artifact.day);
  const manifestSha256 = sha256(artifact.manifestBytes);
  checkDigest(manifestSha256, artifact.expectedManifestSha256, `${artifact.day} manifest`);
  const manifest = record(parseJson(artifact.manifestBytes, "manifest", true), "manifest", ["schemaVersion", "day", "windowHours",
    "bindingId", "bindingSha256", "configuredPasses", "attemptedPassWindows", "status", "commentPassCoverage", "finalCap",
    "uniqueCandidateCount", "returnedItemCount", "finalCapExceeded", "passes", "itemsFile", "itemsSha256"]);
  const itemsSha256 = sha256(artifact.itemsBytes);
  checkDigest(itemsSha256, requiredString(manifest.itemsSha256, "itemsSha256"), `${artifact.day} items`);
  const finalCap = readPositiveInteger(binding.config.maxItems, 30, 1, 100);
  if (manifest.schemaVersion !== 1 || manifest.day !== artifact.day || manifest.windowHours !== 24 ||
    manifest.bindingId !== binding.bindingId || manifest.bindingSha256 !== bindingSha256 ||
    manifest.configuredPasses !== 28 || manifest.attemptedPassWindows !== 28 || manifest.itemsFile !== "items.json" ||
    manifest.finalCap !== finalCap || manifest.status !== "incomplete") throw new Error(`${artifact.day} manifest binding/day/coverage mismatch`);
  const { passes, complete, commentCoverage } = validatePasses(manifest.passes, binding.config, window);
  if (manifest.commentPassCoverage !== commentCoverage) throw new Error(`${artifact.day} comment coverage mismatch`);
  const payload = record(parseJson(artifact.itemsBytes, "items", true), "items", ["schemaVersion", "day", "items", "ids",
    "candidateItems", "candidateIds", "comments"]);
  if (payload.schemaVersion !== 1 || payload.day !== artifact.day || !Array.isArray(payload.items) ||
    !Array.isArray(payload.candidateItems) || !Array.isArray(payload.comments)) throw new Error(`${artifact.day} items shape mismatch`);
  const selectedIds = stringArray(payload.ids, "selected ids");
  const candidateIds = stringArray(payload.candidateIds, "candidate ids");
  const candidates = payload.candidateItems.map((item: unknown, index: number) => validateItem(item, `candidate ${index}`));
  const selected = payload.items.map((item: unknown, index: number) => validateItem(item, `selected ${index}`));
  const ids = candidates.map((item) => item.externalId as string);
  if (new Set(ids).size !== ids.length || ids.join("\0") !== candidateIds.join("\0") ||
    selected.map((item) => item.externalId).join("\0") !== selectedIds.join("\0") ||
    JSON.stringify(selected) !== JSON.stringify(candidates.slice(0, finalCap)) ||
    manifest.uniqueCandidateCount !== candidates.length || manifest.returnedItemCount !== selected.length ||
    manifest.finalCapExceeded !== (candidates.length > finalCap)) throw new Error(`${artifact.day} duplicate candidate or item/count mismatch`);
  if (complete === 28 && candidates.length <= finalCap) throw new Error(`${artifact.day} is not a partial source artifact`);
  for (let index = 1; index < candidates.length; index++) {
    const previous = candidates[index - 1]!;
    const current = candidates[index]!;
    if ((previous.publishedAtUnixSeconds as number) < (current.publishedAtUnixSeconds as number) ||
      (previous.publishedAtUnixSeconds === current.publishedAtUnixSeconds &&
        (previous.externalId as string).localeCompare(current.externalId as string) >= 0)) {
      throw new Error(`${artifact.day} candidates are not in exporter order`);
    }
  }
  for (const [index, comment] of payload.comments.entries()) {
    validateComment(comment, `comment ${index}`);
    const unit = comment as Record<string, unknown>;
    if (!ids.includes(unit.rootExternalId as string)) throw new Error(`${artifact.day} comment root is not a candidate`);
  }
  const returned = new Set(passes.flatMap((pass) => pass.returnedIds));
  if (returned.size !== candidates.length || ids.some((id) => !returned.has(id))) throw new Error(`${artifact.day} candidate/pass IDs mismatch`);
  const verified: VerifiedCandidate[] = [];
  let excludedIncompleteOnly = 0;
  let excludedUnverifiableComment = 0;
  let excludedOutOfDay = 0;
  for (const item of candidates) {
    const metadata = item.metadata as Record<string, unknown>;
    const matching = passes.filter((pass) => pass.returnedIds.includes(item.externalId as string) &&
      pass.source === metadata.source && pass.searchQuery === metadata.searchQuery);
    if (matching.length === 0) throw new Error(`${artifact.day} item has no exact pass provenance`);
    const timestamp = Date.parse(item.publishedAt as string);
    const inDay = timestamp >= window.fromMs && timestamp < window.toMs;
    if (!inDay && matching.some((pass) => pass.status === "complete" && pass.source !== "comment_search")) {
      throw new Error(`${artifact.day} complete story pass item is outside its UTC day`);
    }
    // Legacy manifests identify comment-pass roots but not the individual comments.
    // A root seen only through that pass cannot prove a recoverable story.
    const provenance = matching.filter((pass) => pass.status === "complete" && pass.source !== "comment_search")
      .map((pass) => pass.index);
    if (!inDay) excludedOutOfDay += 1;
    else if (provenance.length === 0 && matching.some((pass) => pass.source === "comment_search")) {
      excludedUnverifiableComment += 1;
    } else if (provenance.length === 0) excludedIncompleteOnly += 1;
    else verified.push({ day: artifact.day, externalId: item.externalId as string, item, provenance });
  }
  return { day: artifact.day, manifestSha256, itemsSha256, aggregateStatus: "incomplete" as const,
    completePasses: complete, incompletePasses: 28 - complete,
    incompletePassIndices: passes.filter((pass) => pass.status === "incomplete").map((pass) => pass.index),
    candidateCount: candidates.length, finalCapExceeded: candidates.length > finalCap,
    verifiedCandidates: verified.length,
    excludedIncompleteOnly, excludedUnverifiableComment, excludedOutOfDay, verified };
}

/** Candidate eligibility is source proof only; current DB absence must be checked at a future write boundary. */
export function planVerifiedHnRemainder(input: VerifiedRemainderInput): VerifiedRemainderPlan {
  if (input.days.length === 0 || input.days.length > 8) throw new Error("One to eight explicit days are required");
  const bindingSha256 = sha256(input.bindingBytes);
  checkDigest(bindingSha256, input.expectedBindingSha256, "binding");
  const binding = readBinding(input.bindingBytes);
  const seenDays = new Set<string>();
  const seenIds = new Set<string>();
  const days: VerifiedRemainderPlan["days"][number][] = [];
  const candidates: VerifiedCandidate[] = [];
  for (const artifact of [...input.days].sort((a, b) => a.day.localeCompare(b.day))) {
    if (seenDays.has(artifact.day)) throw new Error(`Duplicate day ${artifact.day}`);
    seenDays.add(artifact.day);
    const verified = validateDay(artifact, binding, bindingSha256);
    days.push({ day: verified.day, manifestSha256: verified.manifestSha256, itemsSha256: verified.itemsSha256,
      aggregateStatus: verified.aggregateStatus, completePasses: verified.completePasses,
      incompletePasses: verified.incompletePasses, incompletePassIndices: verified.incompletePassIndices,
      candidateCount: verified.candidateCount, finalCapExceeded: verified.finalCapExceeded,
      verifiedCandidates: verified.verifiedCandidates,
      excludedIncompleteOnly: verified.excludedIncompleteOnly,
      excludedUnverifiableComment: verified.excludedUnverifiableComment,
      excludedOutOfDay: verified.excludedOutOfDay });
    // Reject overlap even when neither occurrence qualifies for import.
    const payload = record(parseJson(artifact.itemsBytes, "items"), "items", ["schemaVersion", "day", "items", "ids",
      "candidateItems", "candidateIds", "comments"]);
    for (const id of stringArray(payload.candidateIds, "candidate ids")) {
      if (seenIds.has(id)) throw new Error(`Cross-day duplicate candidate ${id}`);
      seenIds.add(id);
    }
    candidates.push(...verified.verified);
  }
  const unsigned = { schemaVersion: 1 as const, coverage: "PARTIAL_SOURCE_ONLY" as const,
    bindingId: binding.bindingId, bindingSha256, bindingQuery: binding.config.query as string, days, candidates };
  return { ...unsigned, planSha256: sha256(JSON.stringify(unsigned)) };
}

export type VerifiedHnImportScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly correlationId: string;
};

export type VerifiedHnImportDependencies = {
  /** Re-read the live tenant/workspace/binding/interest/policy relation and approved query. */
  readonly verifyCurrentBinding: (scope: VerifiedHnImportScope, query: string) => Promise<boolean>;
  /** Must read the current scoped source-item repository. No old snapshot is accepted. */
  readonly findExistingExternalIds: (scope: VerifiedHnImportScope, ids: readonly string[]) => Promise<readonly string[]>;
  readonly sourceItems: SourceItemRepositoryPort;
  readonly feedProjection: FeedProjectionPort;
  readonly conversationProjection: ConversationProjectionPort;
  readonly scanAttempts: ScanAttemptRepositoryPort;
  readonly scanLeases: ScanLeasePort;
  readonly ids: IdGenerator;
  readonly clock: Clock;
};

export type VerifiedHnImportRequest = {
  readonly artifacts: VerifiedRemainderInput;
  readonly expectedPlanSha256: string;
  /** One fixed, exclusive path for this entire Sep20-27 campaign, independent of plan hash. */
  readonly journalPath: string;
  readonly scope: VerifiedHnImportScope;
  readonly dependencies: VerifiedHnImportDependencies;
};

function fetchedItem(candidate: VerifiedCandidate): FetchedSourceItem {
  const item = candidate.item;
  return {
    externalId: item.externalId as string,
    canonicalUrl: item.canonicalUrl as string,
    title: item.title as string,
    body: item.body as string,
    ...(item.authorHandle === undefined ? {} : { authorHandle: item.authorHandle as string }),
    publishedAt: new Date(item.publishedAt as string),
    metadata: item.metadata as FetchedSourceItem["metadata"],
  };
}

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function scanJobId(planSha256: string, day: string): string {
  return deterministicUuid(`hn-verified-remainder:${planSha256}:${day}`);
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(dirname(path), "r");
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function writeExclusiveSynced(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  await syncDirectory(path);
}

/**
 * Explicit opt-in seam. The caller supplies scoped persistence/projection adapters; this function
 * never connects to a database or invokes the posts-once scheduler. A started journal is never
 * retried automatically, even if a scan fails after making partial domain writes.
 */
export async function importVerifiedHnRemainder(request: VerifiedHnImportRequest): Promise<{
  readonly planSha256: string; readonly inserted: number; readonly alreadyPresent: number;
}> {
  const plan = planVerifiedHnRemainder(request.artifacts);
  checkDigest(plan.planSha256, request.expectedPlanSha256, "opt-in plan");
  if (plan.days.length !== 8) throw new Error("One-shot import requires all eight pinned Sep20-27 days");
  if (request.scope.sourceBindingId !== plan.bindingId ||
    [request.scope.tenantId, request.scope.workspaceId, request.scope.interestId,
      request.scope.sourceBindingId, request.scope.scanPolicyId].some((id) => !uuidPattern.test(id)) ||
    !request.scope.correlationId) throw new Error("Import scope/binding mismatch");
  if (plan.candidates.length === 0) throw new Error("No verified candidates to import");
  const journalPath = resolve(request.journalPath);
  if (basename(journalPath) !== journalFileName) throw new Error(`Journal filename must be ${journalFileName}`);
  const journalBase = { schemaVersion: 1, campaign: "hn-verified-remainder-2026-09-20_27", planSha256: plan.planSha256,
    bindingSha256: plan.bindingSha256, artifacts: plan.days.map((day) => ({ day: day.day,
      manifestSha256: day.manifestSha256, itemsSha256: day.itemsSha256 })),
    scope: { tenantId: request.scope.tenantId, workspaceId: request.scope.workspaceId,
      interestId: request.scope.interestId, sourceBindingId: request.scope.sourceBindingId,
      scanPolicyId: request.scope.scanPolicyId },
    candidateIds: plan.candidates.map((candidate) => candidate.externalId) };
  try { await writeExclusiveSynced(journalPath, { ...journalBase, status: "started" }); }
  catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error("Repeat or uncertain HN import journal exists; manual reconciliation required");
    }
    throw error;
  }

  if (!await request.dependencies.verifyCurrentBinding(request.scope, plan.bindingQuery)) {
    throw new Error("Current scoped binding does not match pinned HN query; journal remains started");
  }
  const ids = plan.candidates.map((candidate) => candidate.externalId);
  const existing = await request.dependencies.findExistingExternalIds(request.scope, ids);
  const allowed = new Set(ids);
  if (new Set(existing).size !== existing.length || existing.some((id) => !allowed.has(id))) {
    throw new Error("Current scoped source-item snapshot is invalid; journal remains started");
  }
  const existingSet = new Set(existing);
  const missing = plan.candidates.filter((candidate) => !existingSet.has(candidate.externalId));
  const byJob = new Map<string, readonly FetchedSourceItem[]>();
  for (const day of plan.days) {
    byJob.set(scanJobId(plan.planSha256, day.day),
      missing.filter((candidate) => candidate.day === day.day).map(fetchedItem));
  }
  const fetcher: SourceFetcherPort = {
    fetch: async (command: FetchSourceItemsCommand) => {
      const items = byJob.get(command.scanJobId);
      if (items === undefined || command.tenantId !== request.scope.tenantId ||
        command.workspaceId !== request.scope.workspaceId || command.sourceBindingId !== plan.bindingId ||
        command.providerKey !== "hacker-news" || command.sourceQuery.mode !== "search" ||
        command.sourceQuery.query !== plan.bindingQuery || command.cursor !== undefined) {
        throw new Error("Verified HN fetcher command mismatch");
      }
      byJob.delete(command.scanJobId);
      return { items, conversationUnits: [], warnings: ["Verified HN remainder is partial source coverage"] };
    },
  };
  // This composition prevents live acquisition, source-complete reporting, cursor mutation,
  // article fetches and retry dispatch while preserving the domain persistence/projection path.
  const executeScan = new ExecuteScanUseCase(fetcher, request.dependencies.sourceItems,
    request.dependencies.feedProjection, request.dependencies.scanAttempts,
    { findBySourceBinding: async () => null,
      save: async () => { throw new Error("Verified HN import must not save a scan cursor"); } },
    new NoopScanExecutionReporterAdapter(),
    { enqueueRetry: async () => { throw new Error("Verified HN import must not enqueue a retry"); },
      deadLetter: async () => undefined },
    request.dependencies.scanLeases, request.dependencies.ids, request.dependencies.clock,
    undefined, noopSourceItemEnrichment, request.dependencies.conversationProjection);
  let inserted = 0;
  for (const day of plan.days) {
    const jobId = scanJobId(plan.planSha256, day.day);
    const expected = missing.filter((candidate) => candidate.day === day.day).length;
    if (expected === 0) continue;
    const result = await executeScan.execute({ tenantId: request.scope.tenantId, workspaceId: request.scope.workspaceId,
      interestId: request.scope.interestId, sourceBindingId: plan.bindingId, scanJobId: jobId,
      scanPolicyId: request.scope.scanPolicyId,
      providerKey: "hacker-news", sourceQuery: { mode: "search", query: plan.bindingQuery },
      correlationId: request.scope.correlationId, causationId: plan.planSha256, attemptNumber: 1, retryBudget: 0 });
    if (byJob.has(jobId) || !result.ok || result.value.fetched !== expected || result.value.inserted !== expected ||
      result.value.projected !== expected) {
      throw new Error(`HN verified import for ${day.day} is uncertain; journal remains started`);
    }
    inserted += result.value.inserted;
  }
  const completedPath = `${journalPath}.${plan.planSha256}.complete.tmp`;
  await writeExclusiveSynced(completedPath, { ...journalBase, status: "complete", inserted,
    alreadyPresent: existing.length });
  await rename(completedPath, journalPath);
  await syncDirectory(journalPath);
  return { planSha256: plan.planSha256, inserted, alreadyPresent: existing.length };
}

type PinFile = { schemaVersion: 1; bindingSha256: string; days: { day: string; directory: string; manifestSha256: string }[] };

/** The CLI has no write or network path. Pins must be supplied independently of the artifacts. */
export async function planVerifiedHnRemainderFromFiles(bindingPath: string, pinsPath: string): Promise<VerifiedRemainderPlan> {
  const pins = record(parseJson(await readFile(pinsPath), "pins"), "pins", ["schemaVersion", "bindingSha256", "days"]);
  if (pins.schemaVersion !== 1 || !Array.isArray(pins.days)) throw new Error("Pins file shape mismatch");
  const parsed = pins as unknown as PinFile;
  const days: PinnedDayArtifact[] = [];
  for (const [index, value] of parsed.days.entries()) {
    const pin = record(value, `pin ${index}`, ["day", "directory", "manifestSha256"]);
    dayWindow(requiredString(pin.day, `pin ${index} day`));
    const directory = resolve(requiredString(pin.directory, `pin ${index} directory`));
    days.push({ day: pin.day as string, expectedManifestSha256: requiredString(pin.manifestSha256, "manifest SHA"),
      manifestBytes: await readFile(resolve(directory, "manifest.json")), itemsBytes: await readFile(resolve(directory, "items.json")) });
  }
  return planVerifiedHnRemainder({ bindingBytes: await readFile(bindingPath),
    expectedBindingSha256: requiredString(parsed.bindingSha256, "binding SHA"), days });
}

/** Safe CLI receipt: provider payloads and binding queries remain inside the private plan. */
export function verifiedHnPlanReceipt(plan: VerifiedRemainderPlan): Readonly<Record<string, unknown>> {
  return { schemaVersion: plan.schemaVersion, coverage: plan.coverage,
    bindingSha256: plan.bindingSha256, days: plan.days,
    candidateCount: plan.candidates.length, planSha256: plan.planSha256 };
}

if (typeof require !== "undefined" && require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--binding" || args[2] !== "--pins") {
    process.stderr.write("Usage: --binding SANITIZED_BINDING.json --pins INDEPENDENT_SHA_PINS.json\n");
    process.exitCode = 2;
  } else {
    planVerifiedHnRemainderFromFiles(args[1]!, args[3]!)
      .then((plan) => { process.stdout.write(`${JSON.stringify(verifiedHnPlanReceipt(plan), null, 2)}\n`); })
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : "Verification failed"}\n`);
        process.exitCode = 2;
      });
  }
}
