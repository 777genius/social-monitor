/** Offline, source-only RSS Sep 24 verification and one-shot domain import. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, type FileHandle } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { readFeedUrls, readPositiveInteger } from "@social-monitor/ingestion/adapters/source/rss/rss-cursor-and-config";
import { hasReadableFeedText } from "@social-monitor/ingestion/adapters/source/rss/rss-readable-content";
import { feedUrlsForTargetWindow } from "@social-monitor/ingestion/adapters/source/rss/rss-source-window";
import { NoopScanExecutionReporterAdapter } from "@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter";
import { ExecuteScanUseCase } from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case";
import { sanitizeFetchedSourceItem } from "@social-monitor/ingestion/features/execute-scan/scan-source-sanitization";
import { noopSourceItemEnrichment, type FeedProjectionPort, type FetchSourceItemsCommand,
  type FetchedSourceItem, type ScanAttemptRepositoryPort, type ScanLeasePort,
  type SourceFetcherPort, type SourceItemRepositoryPort, type SourceRuntimeConfig } from "@social-monitor/ingestion/ports";
import { validateOutboundUrl, type Clock, type IdGenerator, type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";

const DAY = "2026-09-24";
const START = "2026-09-24T00:00:00.000Z";
const END = "2026-09-25T00:00:00.000Z";
export const RSS_SEP24_JOURNAL = "rss-verified-posts-2026-09-24.journal.json";
const digestPattern = /^[a-f0-9]{64}$/u;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const sha = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

export type RssSep24PinnedScope = Readonly<{ tenantId: TenantId; workspaceId: WorkspaceId;
  interestId: string; sourceBindingId: string; scanPolicyId: string }>;
export type RssSep24Artifacts = Readonly<{
  pinnedScope: RssSep24PinnedScope;
  bindingBytes: Buffer; expectedBindingSha256: string;
  manifestBytes: Buffer; expectedManifestSha256: string;
  itemsBytes: Buffer; expectedItemsSha256: string;
}>;
export type RssSep24Candidate = Readonly<{ externalId: string; item: FetchedSourceItem }>;
export type RssSep24Plan = Readonly<{
  schemaVersion: 1; day: typeof DAY; coverage: "PARTIAL_SOURCE_ONLY";
  bindingId: string; bindingSha256: string; manifestSha256: string; itemsSha256: string;
  scope: RssSep24PinnedScope;
  feedUrl: string; bindingConfig: string; selectedCount: number; distinctCount: number;
  candidates: readonly RssSep24Candidate[]; planSha256: string;
}>;

function object(value: unknown, label: string, keys: readonly string[], required: readonly string[] = keys): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !keys.includes(key)) || required.some((key) => !(key in row))) {
    throw new Error(`${label} has missing or unknown fields`);
  }
  return row;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}
function digest(actual: string, expected: string, label: string): void {
  if (!digestPattern.test(expected) || actual !== expected) throw new Error(`${label} SHA-256 mismatch`);
}
function json(bytes: Buffer, label: string): unknown {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new Error(`${label} is not JSON`); }
  if (bytes.toString("utf8") !== `${JSON.stringify(value, null, 2)}\n`) {
    throw new Error(`${label} must be exact capture JSON (no duplicate keys)`);
  }
  return value;
}
function timestamp(value: unknown): Date {
  const source = string(value, "publishedAt");
  const ms = Date.parse(source);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== source || ms < Date.parse(START) || ms >= Date.parse(END)) {
    throw new Error("RSS item is outside Sep 24 UTC or has invalid timestamp");
  }
  return new Date(ms);
}
function safeUrl(value: unknown, label: string): string {
  const source = string(value, label);
  let url: URL;
  try { url = new URL(source); }
  catch { throw new Error(`${label} is not a URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== source ||
    source.length > 4096 || hasControlCharacter(source)) throw new Error(`${label} is unsafe`);
  if (!validateOutboundUrl(source, { label, allowedProtocols: ["https:"] }).ok) {
    throw new Error(`${label} is unsafe`);
  }
  return source;
}
function normalizedItem(value: unknown, label: string, feeds: ReadonlySet<string>): RssSep24Candidate {
  const row = object(value, label, ["externalId", "canonicalUrl", "title", "body", "authorHandle", "publishedAt", "metadata"],
    ["externalId", "canonicalUrl", "title", "body", "publishedAt", "metadata"]);
  const externalId = string(row.externalId, `${label} externalId`);
  if (externalId.length > 2048 || hasControlCharacter(externalId)) throw new Error(`${label} provider ID is malformed`);
  const canonicalUrl = safeUrl(row.canonicalUrl, `${label} canonicalUrl`);
  if (!externalId.startsWith("https://") && !externalId.startsWith("http://") && !/^[^\s<>]+$/u.test(externalId)) {
    throw new Error(`${label} provider ID is malformed`);
  }
  if (externalId.startsWith("https://") || externalId.startsWith("http://")) safeUrl(externalId, `${label} externalId`);
  // The RSS adapter uses URL#index only when the publisher supplied no GUID. Such IDs
  // cannot independently prove the original feed index and are excluded from this import.
  if (/#[0-9]+$/u.test(externalId) && externalId.startsWith(canonicalUrl)) throw new Error(`${label} lacks a stable GUID`);
  const title = row.title;
  const body = row.body;
  if (typeof title !== "string" || typeof body !== "string" ||
    title.length > 20_000 || body.length > 1_000_000 ||
    (row.authorHandle !== undefined && typeof row.authorHandle !== "string")) throw new Error(`${label} has incomplete content`);
  if (!hasReadableFeedText(title) && !hasReadableFeedText(body)) {
    throw new Error(`${label} has incomplete content`);
  }
  const publishedAt = timestamp(row.publishedAt);
  const metadata = object(row.metadata, `${label} metadata`, ["kind", "feedUrl", "nativeContentComplete",
    "searchQuery", "mediaThumbnailUrl", "mediaContentUrl", "mediaContentType", "enclosureUrl", "enclosureType"],
    ["kind", "feedUrl"]);
  const feedUrl = safeUrl(metadata.feedUrl, `${label} feedUrl`);
  if (metadata.kind !== "rss_item" || !feeds.has(feedUrl) ||
    (metadata.nativeContentComplete !== undefined && metadata.nativeContentComplete !== true) ||
    (metadata.searchQuery !== undefined && metadata.searchQuery !== new URL(feedUrl).searchParams.get("q")?.trim()) ||
    ["mediaThumbnailUrl", "mediaContentUrl", "mediaContentType", "enclosureUrl", "enclosureType"]
      .some((key) => metadata[key] !== undefined && typeof metadata[key] !== "string")) {
    throw new Error(`${label} has unverified RSS adapter metadata`);
  }
  const item: FetchedSourceItem = { externalId, canonicalUrl, title, body, publishedAt,
    ...(row.authorHandle === undefined ? {} : { authorHandle: row.authorHandle as string }),
    metadata: metadata as unknown as FetchedSourceItem["metadata"] };
  const sanitized = sanitizeFetchedSourceItem(item);
  if (sanitized.externalId !== item.externalId || sanitized.canonicalUrl !== item.canonicalUrl ||
    sanitized.title !== item.title || sanitized.body !== item.body ||
    sanitized.authorHandle !== item.authorHandle ||
    JSON.stringify(sanitized.metadata) !== JSON.stringify(item.metadata)) {
    throw new Error(`${label} would be changed by ingestion sanitization`);
  }
  return { externalId, item };
}

/** The capture contains only selected normalized adapter output; URL lists are never candidates. */
export function planRssSep24Verified(input: RssSep24Artifacts): RssSep24Plan {
  const bindingSha256 = sha(input.bindingBytes);
  const manifestSha256 = sha(input.manifestBytes);
  const itemsSha256 = sha(input.itemsBytes);
  digest(bindingSha256, input.expectedBindingSha256, "binding");
  digest(manifestSha256, input.expectedManifestSha256, "manifest");
  digest(itemsSha256, input.expectedItemsSha256, "items");
  const bindings = json(input.bindingBytes, "binding");
  if (!Array.isArray(bindings) || bindings.length !== 1) throw new Error("Exactly one RSS binding is required");
  const binding = object(bindings[0], "binding", ["bindingId", "status", "config"]);
  const bindingId = string(binding.bindingId, "bindingId");
  if (!uuidPattern.test(bindingId) || binding.status !== "ENABLED") throw new Error("RSS binding identity/status mismatch");
  const scope = object(input.pinnedScope, "pinned scope", ["tenantId", "workspaceId", "interestId",
    "sourceBindingId", "scanPolicyId"]) as unknown as RssSep24PinnedScope;
  if ([scope.tenantId, scope.workspaceId, scope.interestId, scope.sourceBindingId,
    scope.scanPolicyId].some((id) => !uuidPattern.test(id)) || scope.sourceBindingId !== bindingId) {
    throw new Error("Pinned RSS scope/binding mismatch");
  }
  const config = object(binding.config, "binding config", ["feedUrl", "url", "feedUrls", "extraFeedUrls",
    "maxItems", "maxItemAgeHours", "targetPublishedWindow"], []);
  if (config.feedUrl !== undefined && config.url !== undefined && config.feedUrl !== config.url) {
    throw new Error("Binding feed URL is ambiguous");
  }
  const feedUrl = safeUrl(config.feedUrl ?? config.url, "binding feed URL");
  if (config.targetPublishedWindow !== undefined) {
    const window = object(config.targetPublishedWindow, "target window", ["startInclusive", "endExclusive"]);
    if (window.startInclusive !== START || window.endExclusive !== END) throw new Error("Binding target day mismatch");
  }
  const maxItems = readPositiveInteger(config.maxItems, 30, 1, 100);
  if (config.maxItemAgeHours !== undefined &&
    (!Number.isSafeInteger(config.maxItemAgeHours) || (config.maxItemAgeHours as number) < 1 ||
      (config.maxItemAgeHours as number) > 24 * 31)) throw new Error("Binding maxItemAgeHours is invalid");
  for (const key of ["feedUrls", "extraFeedUrls"] as const) {
    const value = config[key];
    if (value !== undefined && (!Array.isArray(value) || value.some((entry) =>
      typeof entry !== "string" || entry.trim() !== entry || entry.length === 0))) {
      throw new Error(`Binding ${key} is malformed`);
    }
  }
  const feedUrls = readFeedUrls(feedUrl, config as unknown as SourceRuntimeConfig);
  const expandedFeeds = feedUrlsForTargetWindow(feedUrls, { startInclusive: new Date(START), endExclusive: new Date(END) });
  const manifest = object(json(input.manifestBytes, "manifest"), "manifest", ["schemaVersion", "day", "providerKey",
    "bindingId", "bindingSha256", "scope", "scanMode", "sourceStatus", "window", "selectedIds", "itemsSha256"]);
  const manifestScope = object(manifest.scope, "manifest scope", ["tenantId", "workspaceId", "interestId",
    "sourceBindingId", "scanPolicyId"]);
  const scanWindow = object(manifest.window, "scan window", ["from", "to"]);
  const selectedManifestIds = manifest.selectedIds;
  if (manifest.schemaVersion !== 1 || manifest.day !== DAY || manifest.providerKey !== "rss" ||
    manifest.bindingId !== bindingId || manifest.bindingSha256 !== bindingSha256 || manifest.scanMode !== "read_only" ||
    manifest.sourceStatus !== "partial" || scanWindow.from !== START || scanWindow.to !== END ||
    Object.entries(scope).some(([key, value]) => manifestScope[key] !== value) ||
    manifest.itemsSha256 !== itemsSha256 || !Array.isArray(selectedManifestIds)) {
    throw new Error("Manifest binding/day/source proof mismatch");
  }
  const payload = object(json(input.itemsBytes, "items"), "items", ["schemaVersion", "day", "items"]);
  if (payload.schemaVersion !== 1 || payload.day !== DAY || !Array.isArray(payload.items) ||
    payload.items.length < 1 || payload.items.length > maxItems ||
    selectedManifestIds.length !== payload.items.length) throw new Error("Selected RSS item count mismatch");
  const feeds = new Set(expandedFeeds);
  const selected = payload.items.map((value, index) => normalizedItem(value, `item ${index}`, feeds));
  const selectedIds = selected.map((candidate) => candidate.externalId);
  if (selectedIds.some((id, index) => selectedManifestIds[index] !== id)) throw new Error("Selected RSS provider IDs mismatch");
  const seen = new Map<string, string>();
  for (const candidate of selected) {
    // The adapter may select the same GUID from more than one approved feed.
    // Feed provenance can differ; the actual post content and media must agree.
    const metadata = { ...(candidate.item.metadata ?? {}) };
    delete metadata.feedUrl;
    delete metadata.searchQuery;
    const serialized = JSON.stringify({ ...candidate.item, metadata });
    const previous = seen.get(candidate.externalId);
    if (previous !== undefined && previous !== serialized) throw new Error("Duplicate RSS provider ID has conflicting content");
    seen.set(candidate.externalId, serialized);
  }
  const candidates = selected.filter((candidate, index) => selectedIds.indexOf(candidate.externalId) === index);
  const unsigned = { schemaVersion: 1 as const, day: DAY as typeof DAY, coverage: "PARTIAL_SOURCE_ONLY" as const,
    bindingId, bindingSha256, manifestSha256, itemsSha256, scope, feedUrl,
    bindingConfig: JSON.stringify(config), selectedCount: selected.length, distinctCount: candidates.length,
    candidates };
  return { ...unsigned, planSha256: sha(JSON.stringify(unsigned)) };
}

export type RssSep24Scope = RssSep24PinnedScope & Readonly<{ correlationId: string }>;
export type RssSep24WriteDependencies = Readonly<{
  verifyCurrentBinding: (scope: RssSep24Scope, feedUrl: string, config: string) => Promise<boolean>;
  findExistingExternalIds: (scope: RssSep24Scope, ids: readonly string[]) => Promise<readonly string[]>;
  sourceItems: { saveBatchInsertOnly: SourceItemRepositoryPort["saveBatch"] };
  feedProjection: FeedProjectionPort; scanAttempts: ScanAttemptRepositoryPort; scanLeases: ScanLeasePort;
  ids: IdGenerator; clock: Clock;
}>;
export type RssSep24Dependencies = Readonly<{
  withAtomicWrites: <T>(scope: RssSep24Scope, feedUrl: string, config: string,
    work: (writes: RssSep24WriteDependencies) => Promise<T>) => Promise<T>;
}>;
const deterministicUuid = (value: string): string => {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
async function writeExclusive(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

/** A started journal is deliberately irreversible without manual reconciliation. */
export async function importRssSep24Verified(request: Readonly<{ artifacts: RssSep24Artifacts;
  expectedPlanSha256: string; journalPath: string; scope: RssSep24Scope;
  journalDirectory?: FileHandle;
  dependencies: RssSep24Dependencies }>): Promise<Readonly<{ coverage: "PARTIAL_SOURCE_ONLY";
    planSha256: string; inserted: number; alreadyPresent: number; postWritePresent: number }>> {
  const plan = planRssSep24Verified(request.artifacts);
  digest(plan.planSha256, request.expectedPlanSha256, "expected plan");
  if (Object.entries(plan.scope).some(([key, value]) => request.scope[key as keyof RssSep24PinnedScope] !== value) ||
    [request.scope.tenantId, request.scope.workspaceId, request.scope.interestId,
      request.scope.sourceBindingId, request.scope.scanPolicyId].some((id) => !uuidPattern.test(id)) ||
    !/^[a-zA-Z0-9._:-]{1,128}$/u.test(request.scope.correlationId)) throw new Error("Import scope/binding mismatch");
  const journalPath = resolve(request.journalPath);
  if (basename(journalPath) !== RSS_SEP24_JOURNAL) throw new Error("RSS journal filename mismatch");
  const directory = request.journalDirectory ??
    await open(dirname(journalPath), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const anchoredPath = `/proc/self/fd/${directory.fd}/${RSS_SEP24_JOURNAL}`;
  try {
    const original = await directory.stat();
    const assertLocation = async (): Promise<void> => {
      const current = await lstat(dirname(journalPath));
      if (!current.isDirectory() || current.dev !== original.dev || current.ino !== original.ino) {
        throw new Error("RSS journal directory moved; manual reconciliation required");
      }
    };
    await assertLocation();
    const journal = { schemaVersion: 1, day: DAY, coverage: plan.coverage, planSha256: plan.planSha256,
      bindingSha256: plan.bindingSha256, manifestSha256: plan.manifestSha256, itemsSha256: plan.itemsSha256,
      scope: request.scope, candidateIds: plan.candidates.map((candidate) => candidate.externalId) };
    try { await writeExclusive(anchoredPath, { ...journal, status: "started" }); await directory.sync(); }
    catch (error) {
      if (error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST") {
        throw new Error("Previous RSS journal/replay requires manual reconciliation");
      }
      throw error;
    }
    const receipt = await request.dependencies.withAtomicWrites(request.scope, plan.feedUrl, plan.bindingConfig, async (writes) => {
      if (!await writes.verifyCurrentBinding(request.scope, plan.feedUrl, plan.bindingConfig)) {
        throw new Error("Current scoped RSS binding mismatch; journal remains started");
      }
      const ids = plan.candidates.map((candidate) => candidate.externalId);
      const existing = await writes.findExistingExternalIds(request.scope, ids);
      if (new Set(existing).size !== existing.length || existing.some((id) => !ids.includes(id))) {
        throw new Error("Scoped RSS source-item snapshot invalid; journal remains started");
      }
      const existingSet = new Set(existing);
      const missing = plan.candidates.filter((candidate) => !existingSet.has(candidate.externalId));
      let fetched = false;
      const jobId = deterministicUuid(`rss-sep24:${plan.planSha256}`);
      const fetcher: SourceFetcherPort = { fetch: async (command: FetchSourceItemsCommand) => {
        if (fetched || command.scanJobId !== jobId || command.tenantId !== request.scope.tenantId ||
          command.workspaceId !== request.scope.workspaceId || command.sourceBindingId !== plan.bindingId ||
          command.providerKey !== "rss" || command.sourceQuery.mode !== "url" ||
          command.sourceQuery.query !== plan.feedUrl || command.cursor !== undefined) throw new Error("Verified RSS fetch mismatch");
        fetched = true;
        return { items: missing.map((candidate) => candidate.item), warnings: ["Partial source-only RSS capture"] };
      } };
      const sourceItems: SourceItemRepositoryPort = { saveBatch: (command) => writes.sourceItems.saveBatchInsertOnly(command) };
      let inserted = 0;
      if (missing.length > 0) {
        const scan = new ExecuteScanUseCase(fetcher, sourceItems, writes.feedProjection,
          writes.scanAttempts, { findBySourceBinding: async () => null,
            save: async () => { throw new Error("Verified RSS import cannot save a cursor"); } },
          new NoopScanExecutionReporterAdapter(), { enqueueRetry: async () => { throw new Error("Verified RSS cannot retry"); },
            deadLetter: async () => undefined }, writes.scanLeases, writes.ids,
          writes.clock, undefined, noopSourceItemEnrichment);
        const result = await scan.execute({ tenantId: request.scope.tenantId, workspaceId: request.scope.workspaceId,
          interestId: request.scope.interestId, sourceBindingId: plan.bindingId, scanJobId: jobId,
          scanPolicyId: request.scope.scanPolicyId, providerKey: "rss", sourceQuery: { mode: "url", query: plan.feedUrl },
          correlationId: request.scope.correlationId, causationId: plan.planSha256, attemptNumber: 1, retryBudget: 0 });
        if (!fetched || !result.ok || result.value.fetched !== missing.length ||
          result.value.inserted !== missing.length || result.value.projected !== missing.length) {
          throw new Error("RSS import outcome uncertain; journal remains started");
        }
        inserted = result.value.inserted;
      }
      const after = await writes.findExistingExternalIds(request.scope, ids);
      if (new Set(after).size !== after.length || after.length !== ids.length || after.some((id) => !ids.includes(id))) {
        throw new Error("Post-write RSS count mismatch; journal remains started");
      }
      return { coverage: plan.coverage, planSha256: plan.planSha256,
        inserted, alreadyPresent: existing.length, postWritePresent: after.length };
    });
    await assertLocation();
    const anchoredTemp = `${anchoredPath}.${plan.planSha256}.complete.tmp`;
    await writeExclusive(anchoredTemp, { ...journal, status: "complete", ...receipt });
    await directory.sync();
    await assertLocation();
    await rename(anchoredTemp, anchoredPath);
    await directory.sync();
    await assertLocation();
    return receipt;
  } finally { if (request.journalDirectory === undefined) await directory.close(); }
}
