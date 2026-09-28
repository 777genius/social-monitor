/** Private, read-only HN acquisition. Run with ts-node -r tsconfig-paths/register. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import type { HackerNewsClientPort } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";
import { readScanPasses, type HackerNewsScanPass } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-scan-pass-support";
import { readPositiveInteger } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source-window";
import type { FetchedConversationUnit, FetchedSourceItem, SourceRuntimeConfig } from "@social-monitor/ingestion/ports";
import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

type Binding = { readonly bindingId: string; readonly status: string; readonly config: SourceRuntimeConfig };
type PassResult = {
  readonly index: number;
  readonly window: { readonly from: string; readonly to: string };
  readonly mode: HackerNewsScanPass["mode"];
  readonly target: "story" | "comment";
  readonly query: string;
  readonly maxItems: number;
  readonly status: "complete" | "incomplete";
  readonly returnedIds: readonly string[];
  readonly warnings: readonly string[];
  readonly error?: string;
};

export type HistoricalDayInput = {
  readonly day: string;
  readonly bindingsPath: string;
  readonly outputDir: string;
  readonly windowHours?: number;
  readonly client: HackerNewsClientPort;
};

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function utcDayWindow(day: string): { readonly from: Date; readonly to: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error("--day must be an explicit YYYY-MM-DD UTC day");
  const from = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || from.toISOString().slice(0, 10) !== day) {
    throw new Error("--day is not a valid UTC calendar day");
  }
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

function bindingFromJson(value: unknown): Binding {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Exactly one sanitized HN binding is required");
  const binding: unknown = value[0];
  if (binding === null || typeof binding !== "object" || Array.isArray(binding)) throw new Error("Invalid HN binding");
  const row = binding as Record<string, unknown>;
  if (Object.keys(row).some((key) => !["bindingId", "status", "config"].includes(key))) {
    throw new Error("Sanitized binding contains unsupported fields");
  }
  if (typeof row.bindingId !== "string" || row.bindingId.length === 0 || row.status !== "ENABLED" ||
    row.config === null || typeof row.config !== "object" || Array.isArray(row.config)) {
    throw new Error("A sanitized, enabled HN binding is required");
  }
  const config = row.config as SourceRuntimeConfig;
  const allowedConfig = new Set(["mode", "query", "maxItems", "scanPasses", "maxItemAgeHours"]);
  if (Object.keys(config).some((key) => !allowedConfig.has(key))) {
    throw new Error("Sanitized binding contains unsupported configuration fields");
  }
  if (config.mode !== "search" || typeof config.query !== "string" || config.query.trim().length === 0) {
    throw new Error("Sanitized HN binding must have a search query");
  }
  return { bindingId: row.bindingId, status: row.status, config };
}

function windows(day: string, windowHours: number): readonly { readonly from: Date; readonly to: Date }[] {
  const dayWindow = utcDayWindow(day);
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 24 || 24 % windowHours !== 0) {
    throw new Error("--window-hours must divide 24 and be between 1 and 24");
  }
  const width = windowHours * 3_600_000;
  return Array.from({ length: 24 / windowHours }, (_, index) => ({
    from: new Date(dayWindow.from.getTime() + index * width),
    to: new Date(dayWindow.from.getTime() + (index + 1) * width),
  }));
}

function normalizedItem(item: FetchedSourceItem) {
  return {
    externalId: item.externalId,
    canonicalUrl: item.canonicalUrl,
    title: item.title,
    body: item.body,
    ...(item.authorHandle === undefined ? {} : { authorHandle: item.authorHandle }),
    publishedAt: item.publishedAt.toISOString(),
    publishedAtUnixSeconds: item.publishedAt.getTime() / 1000,
    ...(item.metadata === undefined ? {} : { metadata: item.metadata }),
  };
}

function normalizedComment(unit: FetchedConversationUnit) {
  return {
    rootExternalId: unit.rootExternalId,
    rootProviderItemId: unit.rootProviderItemId,
    providerUnitId: unit.providerUnitId,
    canonicalUrl: unit.canonicalUrl,
    body: unit.body,
    ...(unit.authorHandle === undefined ? {} : { authorHandle: unit.authorHandle }),
    publishedAt: unit.publishedAt.toISOString(),
    publishedAtUnixSeconds: unit.publishedAt.getTime() / 1000,
    threadExternalId: unit.threadExternalId,
    ...(unit.parentProviderUnitId === undefined ? {} : { parentProviderUnitId: unit.parentProviderUnitId }),
    depth: unit.depth,
    role: unit.role,
    ...(unit.metadata === undefined ? {} : { metadata: unit.metadata }),
  };
}

/** Every configured pass is attempted in every bounded window; warnings fail closed. */
export async function recoverHnPublicHistoricalDay(input: HistoricalDayInput) {
  const intervals = windows(input.day, input.windowHours ?? 24);
  const bindingBytes = await readFile(input.bindingsPath);
  const binding = bindingFromJson(JSON.parse(bindingBytes.toString("utf8")) as unknown);
  const config = binding.config;
  const configured = config.scanPasses;
  if (!Array.isArray(configured) || configured.length !== 28) {
    throw new Error("Sanitized binding must contain all 28 configured scan passes");
  }
  const passes = readScanPasses(config);
  if (passes.length !== configured.length) throw new Error("HN scan pass coverage is incomplete");
  const allowedPassFields = new Set(["mode", "listing", "query", "target", "maxItems", "requiredKeywords",
    "requiredStoryKeywords", "includeComments", "maxCommentedStories", "maxCommentsPerPost", "commentDepth"]);
  for (const rawPass of configured) {
    if (rawPass === null || typeof rawPass !== "object" || Array.isArray(rawPass) ||
      Object.keys(rawPass).some((key) => !allowedPassFields.has(key))) {
      throw new Error("Sanitized binding contains unsupported scan pass fields");
    }
  }
  const finalCap = readPositiveInteger(config.maxItems, 30, 1, 100);
  const fallbackCap = Math.max(1, Math.ceil(finalCap / passes.length));
  const provider = new HackerNewsSourceProvider(input.client, { now: () => intervals[0]!.to });
  const query = { mode: "search" as const, query: config.query as string };
  if (!provider.validateBinding(query).ok) throw new Error("HN binding validation failed");

  // mkdir without recursive mode is the exclusive reservation: existing output is never reused.
  const outputDir = resolve(input.outputDir);
  await mkdir(outputDir, { mode: 0o700 });
  const passResults: PassResult[] = [];
  const items = new Map<string, FetchedSourceItem>();
  const comments = new Map<string, FetchedConversationUnit>();
  for (const interval of intervals) {
    for (const [index, pass] of passes.entries()) {
      const limit = pass.maxItems ?? fallbackCap;
      const window = { from: interval.from.toISOString(), to: interval.to.toISOString() };
      const passQuery = pass.mode === "listing"
        ? (pass.requiredKeywords === undefined ? query.query : pass.requiredKeywords.join(" "))
        : pass.query;
      const base = { index, window, mode: pass.mode, target: pass.mode === "search" ? pass.target : "story" as const,
        query: passQuery, maxItems: limit };
      const context = {
        tenantId: "offline" as TenantId, workspaceId: "offline" as WorkspaceId,
        sourceBindingId: binding.bindingId, scanJobId: "offline", correlationId: "offline",
        config: { ...config, maxItems: limit, scanPasses: [pass],
          targetPublishedWindow: { startInclusive: window.from, endExclusive: window.to } },
      };
      try {
        const result = await provider.scan(provider.planScan(query, context), context);
        const warnings = [...result.warnings];
        if (pass.mode === "listing" || pass.target === "story") {
          if (result.items.some((item) => item.publishedAt < interval.from || item.publishedAt >= interval.to)) {
            warnings.push("HN story result fell outside the requested UTC window");
          }
        }
        if ((result.conversationUnits ?? []).some((unit) => unit.publishedAt < interval.from || unit.publishedAt >= interval.to)) {
          warnings.push("HN comment result fell outside the requested UTC window");
        }
        if (result.items.length > limit) warnings.push("HN pass returned more items than its configured cap");
        for (const item of result.items) if (!items.has(item.externalId)) items.set(item.externalId, item);
        for (const unit of result.conversationUnits ?? []) {
          if (!comments.has(unit.providerUnitId)) comments.set(unit.providerUnitId, unit);
        }
        passResults.push({ ...base, status: warnings.length === 0 ? "complete" : "incomplete",
          returnedIds: result.items.map((item) => item.externalId).sort(), warnings });
      } catch (error) {
        passResults.push({ ...base, status: "incomplete", returnedIds: [], warnings: [],
          error: provider.classifyError(error).message });
      }
    }
  }
  const sortedItems = [...items.values()].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.externalId.localeCompare(b.externalId));
  const selectedItems = sortedItems.slice(0, finalCap);
  const sortedComments = [...comments.values()]
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.providerUnitId.localeCompare(b.providerUnitId));
  const complete = passResults.every((pass) => pass.status === "complete") && sortedItems.length <= finalCap;
  const content = json({ schemaVersion: 1, day: input.day, items: selectedItems.map(normalizedItem),
    ids: selectedItems.map((item) => item.externalId),
    candidateItems: sortedItems.map(normalizedItem), candidateIds: sortedItems.map((item) => item.externalId),
    comments: sortedComments.map(normalizedComment) });
  const contentBytes = Buffer.from(content, "utf8");
  const commentPasses = passResults.filter((pass) => pass.target === "comment");
  const manifest = {
    schemaVersion: 1, day: input.day, windowHours: input.windowHours ?? 24, bindingId: binding.bindingId,
    bindingSha256: hash(bindingBytes), configuredPasses: passes.length, attemptedPassWindows: passResults.length,
    status: complete ? "complete" : "incomplete", commentPassCoverage: commentPasses.length === 0 ? "UNKNOWN"
      : commentPasses.every((pass) => pass.status === "complete") ? "FETCHED" : "INCOMPLETE",
    finalCap, uniqueCandidateCount: sortedItems.length, returnedItemCount: selectedItems.length,
    finalCapExceeded: sortedItems.length > finalCap, passes: passResults,
    itemsFile: "items.json", itemsSha256: hash(contentBytes),
  };
  await writeFile(resolve(outputDir, "items.json"), contentBytes, { flag: "wx", mode: 0o600 });
  await writeFile(resolve(outputDir, "manifest.json"), json(manifest), { flag: "wx", mode: 0o600 });
  return manifest;
}

function parseArgs(args: readonly string[]): Omit<HistoricalDayInput, "client"> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !["--day", "--bindings", "--output-dir", "--window-hours"].includes(key) || values.has(key)) {
      throw new Error("Usage: --day YYYY-MM-DD --bindings PATH --output-dir NEW_DIR [--window-hours 1|2|3|4|6|8|12|24]");
    }
    values.set(key, value);
  }
  const day = values.get("--day");
  const bindingsPath = values.get("--bindings");
  const outputDir = values.get("--output-dir");
  if (day === undefined || bindingsPath === undefined || outputDir === undefined) throw new Error("--day, --bindings and --output-dir are required");
  const hours = values.get("--window-hours");
  return { day, bindingsPath, outputDir, ...(hours === undefined ? {} : { windowHours: Number(hours) }) };
}

if (typeof require !== "undefined" && require.main === module) {
  recoverHnPublicHistoricalDay({ ...parseArgs(process.argv.slice(2)), client: new HttpHackerNewsClient() })
    .then((manifest) => {
      process.stdout.write(`${manifest.status}: ${manifest.returnedItemCount} normalized HN items; manifest written\n`);
      if (manifest.status !== "complete") process.exitCode = 2;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "HN export failed"}\n`);
      process.exitCode = 2;
    });
}
