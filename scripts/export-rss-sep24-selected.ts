/** One read-only, source-only Sep 24 RSS scan. No importer or database access. */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { HttpRssClient } from "@social-monitor/ingestion/adapters/source/rss/http-rss-client";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import { feedUrlsForTargetWindow } from "@social-monitor/ingestion/adapters/source/rss/rss-source-window";
import { sanitizeFetchedSourceItem } from "@social-monitor/ingestion/features/execute-scan/scan-source-sanitization";
import type { RssClientPort } from "@social-monitor/ingestion/adapters/source/rss/rss-client.port";
import type { FetchedSourceItem } from "@social-monitor/ingestion/ports";
import { redactSensitiveText, urlContainsCredentials, validateOutboundUrl,
  type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";
import { planRssSep24Verified, type RssSep24PinnedScope } from "./recover-rss-sep24-verified";

const DAY = "2026-09-24";
const START = "2026-09-24T00:00:00.000Z";
const END = "2026-09-25T00:00:00.000Z";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const understoodPartialWarnings = new Set([
  "RSS recovery window exceeds maxItems; acquisition is incomplete.",
  "Some RSS entries could not be parsed; historical acquisition is incomplete.",
  "Some RSS entries had no readable title or content; historical acquisition is incomplete.",
  "Some RSS items had no published timestamp; they were skipped.",
  "Some RSS items had no canonical link; they were skipped.",
]);
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const keys = (value: unknown, expected: readonly string[], label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0")) {
    throw new Error(`${label} shape is unsupported`);
  }
  return value as Record<string, unknown>;
};
const safeFeedUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 4096 || value.trim() !== value) throw new Error("Unsafe feed URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Unsafe feed URL"); }
  if (url.protocol !== "https:" || url.hash || url.toString() !== value ||
    urlContainsCredentials(value) || redactSensitiveText(value) !== value ||
    !validateOutboundUrl(value, { label: "Feed URL", allowedProtocols: ["https:"] }).ok) {
    throw new Error("Unsafe feed URL");
  }
  return value;
};

export type SelectedExportRequest = Readonly<{
  outputRoot: string;
  scope: RssSep24PinnedScope;
  bindings: readonly unknown[];
}>;
export type SelectedExportResult = Readonly<{ pinsSha256: string; selectedCount: number; warningCount: number }>;

type BoundConfig = { extraFeedUrls: string[]; feedUrl: string; maxItemAgeHours: number;
  maxItems: number; mode: "url"; query: string };
type BoundBinding = { bindingId: string; status: "ENABLED"; config: BoundConfig };

function validateRequest(request: SelectedExportRequest): { scope: RssSep24PinnedScope; binding: BoundBinding } {
  const scope = keys(request.scope, ["tenantId", "workspaceId", "interestId", "sourceBindingId", "scanPolicyId"], "scope");
  if (Object.values(scope).some((id) => typeof id !== "string" || !UUID.test(id))) throw new Error("Invalid scope ID");
  if (!Array.isArray(request.bindings) || request.bindings.length !== 1) throw new Error("Exactly one RSS binding required");
  const binding = keys(request.bindings[0], ["bindingId", "status", "config"], "binding");
  if (binding.status !== "ENABLED" || binding.bindingId !== scope.sourceBindingId) throw new Error("Binding/scope mismatch");
  const config = keys(binding.config, ["extraFeedUrls", "feedUrl", "maxItemAgeHours", "maxItems", "mode", "query"], "config");
  const feedUrl = safeFeedUrl(config.feedUrl);
  if (config.mode !== "url" || config.query !== feedUrl) throw new Error("Binding mode/query mismatch");
  if (!Number.isInteger(config.maxItems) || (config.maxItems as number) < 1 || (config.maxItems as number) > 100) {
    throw new Error("Invalid maxItems");
  }
  if (!Number.isSafeInteger(config.maxItemAgeHours) || (config.maxItemAgeHours as number) < 1 ||
    (config.maxItemAgeHours as number) > 24 * 31) throw new Error("Invalid maxItemAgeHours");
  if (!Array.isArray(config.extraFeedUrls) || config.extraFeedUrls.length !== 24) {
    throw new Error("Exactly 24 extra feed URLs required");
  }
  const extras = config.extraFeedUrls.map(safeFeedUrl);
  const feeds = [feedUrl, ...extras];
  if (new Set(feeds).size !== 25) throw new Error("Duplicate feed URL");
  const window = { startInclusive: new Date(START), endExclusive: new Date(END) };
  // This binding permits only the adapter's first 12 Google News terms and 24 single-feed extras.
  const expected = feeds.flatMap((value, index) => {
    const parsed = new URL(value);
    if (parsed.hostname !== "news.google.com" || parsed.pathname !== "/rss/search") return [value];
    const queries = parsed.searchParams.getAll("q");
    if (queries.length > 1) throw new Error("Google News query is ambiguous");
    if (queries.length === 0 || !queries[0]!.trim()) return [value];
    const query = queries[0]!.trim().replace(/\bwhen:\d+[dhm]\b/giu, "")
      .replace(/\s+/gu, " ").trim();
    const terms = query.split(/\s+OR\s+/iu).map((term) => term.trim());
    if (terms.some((term) => !term || /(?:^|\s)OR(?:\s|$)/iu.test(term)) ||
      (index > 0 && terms.length !== 1)) {
      throw new Error("Google News query fanout exceeds bound");
    }
    return terms.slice(0, 12).map((term) => {
      const historical = new URL(value);
      historical.searchParams.set("q", `${term} after:${DAY} before:2026-09-25`);
      return historical.toString();
    });
  });
  const expanded = feedUrlsForTargetWindow(feeds, window);
  if (expanded.length !== expected.length || expanded.length > 36 ||
    expanded.some((value, index) => value !== expected[index]) ||
    new Set(expanded).size !== expanded.length ||
    expanded.some((url) => safeFeedUrl(url) !== url)) {
    throw new Error("Feed fanout is unsupported");
  }
  return { scope: scope as unknown as RssSep24PinnedScope, binding: binding as BoundBinding };
}

function selectedItem(item: FetchedSourceItem): Record<string, unknown> {
  const sanitized = sanitizeFetchedSourceItem(item);
  if (sanitized.externalId !== item.externalId || sanitized.canonicalUrl !== item.canonicalUrl ||
    sanitized.title !== item.title || sanitized.body !== item.body ||
    sanitized.authorHandle !== item.authorHandle || JSON.stringify(sanitized.metadata) !== JSON.stringify(item.metadata)) {
    throw new Error("Selected item changed by sanitization");
  }
  if (!(item.publishedAt instanceof Date) || !Number.isFinite(item.publishedAt.getTime()) ||
    item.publishedAt < new Date(START) || item.publishedAt >= new Date(END)) throw new Error("Selected date invalid");
  if (item.externalId === `${item.canonicalUrl}#0` ||
    (item.externalId.startsWith(`${item.canonicalUrl}#`) && /^\d+$/u.test(item.externalId.slice(item.canonicalUrl.length + 1)))) {
    throw new Error("Selected item lacks stable GUID");
  }
  return { externalId: item.externalId, canonicalUrl: item.canonicalUrl, title: item.title,
    body: item.body, ...(item.authorHandle === undefined ? {} : { authorHandle: item.authorHandle }),
    publishedAt: item.publishedAt.toISOString(), metadata: item.metadata };
}

async function trustedParent(root: string): Promise<void> {
  if (!isAbsolute(root) || resolve(root) !== root || parse(root).root === root) throw new Error("Output root must be a new absolute path");
  const uid = process.getuid?.();
  let current = parse(root).root;
  for (const segment of relative(current, dirname(root)).split(sep).filter(Boolean)) {
    const state = await lstat(current);
    if (!state.isDirectory() || state.isSymbolicLink() || (uid !== undefined && state.uid !== uid && state.uid !== 0) ||
      ((state.mode & 0o022) !== 0 && !(state.uid === 0 && (state.mode & 0o1777) === 0o1777))) {
      throw new Error("Output ancestry is untrusted");
    }
    current = join(current, segment);
  }
  const state = await lstat(current);
  if (!state.isDirectory() || state.isSymbolicLink() || (uid !== undefined && state.uid !== uid && state.uid !== 0) ||
    ((state.mode & 0o022) !== 0 && !(state.uid === 0 && (state.mode & 0o1777) === 0o1777))) {
    throw new Error("Output parent is untrusted");
  }
}

async function writeAtomic(anchor: string, name: string, bytes: Buffer, directory: Awaited<ReturnType<typeof open>>): Promise<void> {
  const temp = `${name}.${randomUUID()}.tmp`;
  const handle = await open(join(anchor, temp), "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await rename(join(anchor, temp), join(anchor, name));
  await directory.sync();
}

/** Inject a synthetic client only for focused source tests; the CLI uses HttpRssClient. */
export async function exportRssSep24Selected(request: SelectedExportRequest,
  client: RssClientPort = new HttpRssClient()): Promise<SelectedExportResult> {
  const { binding, scope } = validateRequest(request);
  await trustedParent(request.outputRoot);
  const provider = new RssSourceProvider(client);
  const query = { mode: "url" as const, query: binding.config.feedUrl };
  const scanId = randomUUID();
  const context = { tenantId: scope.tenantId as TenantId, workspaceId: scope.workspaceId as WorkspaceId,
    sourceBindingId: binding.bindingId, scanJobId: scanId, correlationId: scanId,
    config: { ...binding.config, targetPublishedWindow: { startInclusive: START, endExclusive: END } } };
  const plan = provider.planScan(query, context);
  if (plan.maxItems !== binding.config.maxItems || plan.cursor !== undefined) throw new Error("Unbounded RSS plan");
  const scan = await provider.scan(plan, context);
  if (!Array.isArray(scan.items) || scan.items.length < 1 || scan.items.length > plan.maxItems ||
    !Array.isArray(scan.warnings) || scan.conversationUnits !== undefined) {
    throw new Error("RSS scan incomplete or unknown");
  }
  const items = scan.items.map(selectedItem);
  if (scan.warnings.length > understoodPartialWarnings.size ||
    new Set(scan.warnings).size !== scan.warnings.length ||
    scan.warnings.some((warning) => !understoodPartialWarnings.has(warning))) {
    throw new Error("RSS scan incomplete or unknown");
  }
  const seen = new Map<string, string>();
  for (const item of items) {
    const id = item.externalId as string;
    const metadata = { ...(item.metadata as Record<string, unknown>) };
    delete metadata.feedUrl;
    delete metadata.searchQuery;
    const comparable = JSON.stringify({ ...item, metadata });
    const previous = seen.get(id);
    if (previous !== undefined && previous !== comparable) throw new Error("Conflicting provider ID");
    seen.set(id, comparable);
  }
  const bindingBytes = json([binding]);
  const itemsBytes = json({ schemaVersion: 1, day: DAY, items });
  const manifestBytes = json({ schemaVersion: 1, day: DAY, providerKey: "rss", bindingId: binding.bindingId,
    bindingSha256: sha(bindingBytes), scope, scanMode: "read_only", sourceStatus: "partial",
    window: { from: START, to: END }, selectedIds: items.map((item) => item.externalId), itemsSha256: sha(itemsBytes) });
  const pinsBytes = json({ schemaVersion: 1, day: DAY, scope, bindingSha256: sha(bindingBytes),
    manifestSha256: sha(manifestBytes), itemsSha256: sha(itemsBytes) });
  if ([bindingBytes, itemsBytes, manifestBytes, pinsBytes].some((bytes) => bytes.length > 8_000_000)) {
    throw new Error("RSS evidence exceeds pinned reader limit");
  }
  planRssSep24Verified({ pinnedScope: scope, bindingBytes, expectedBindingSha256: sha(bindingBytes),
    manifestBytes, expectedManifestSha256: sha(manifestBytes), itemsBytes, expectedItemsSha256: sha(itemsBytes) });
  await mkdir(request.outputRoot, { mode: 0o700 });
  const created = await lstat(request.outputRoot);
  const parent = await open(dirname(request.outputRoot), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await parent.sync(); } finally { await parent.close(); }
  const directory = await open(request.outputRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const state = await directory.stat();
    if (state.dev !== created.dev || state.ino !== created.ino ||
      state.uid !== process.getuid?.() || (state.mode & 0o077) !== 0 ||
      await realpath(request.outputRoot) !== request.outputRoot) throw new Error("Output root is not private");
    const anchor = `/proc/self/fd/${directory.fd}`;
    await writeAtomic(anchor, "bindings-sanitized.json", bindingBytes, directory);
    await writeAtomic(anchor, "items.json", itemsBytes, directory);
    await writeAtomic(anchor, "manifest.json", manifestBytes, directory);
    const beforePins = await lstat(request.outputRoot);
    if (beforePins.dev !== state.dev || beforePins.ino !== state.ino) throw new Error("Output root moved");
    // Pins are the commit marker. If their sync fails, remove the marker.
    try { await writeAtomic(anchor, "pins-rss-sep24.json", pinsBytes, directory); }
    catch (error) {
      await unlink(join(anchor, "pins-rss-sep24.json")).catch(() => undefined);
      await directory.sync().catch(() => undefined);
      throw error;
    }
    const current = await lstat(request.outputRoot);
    if (current.dev !== state.dev || current.ino !== state.ino) throw new Error("Output root moved");
  } finally { await directory.close(); }
  return { pinsSha256: sha(pinsBytes), selectedCount: items.length, warningCount: scan.warnings.length };
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 4 || args[0] !== "--request-file" || args[2] !== "--output-root") {
    throw new Error("Usage: --request-file ABSOLUTE_PRIVATE_JSON --output-root NEW_ABSOLUTE_DIRECTORY");
  }
  const path = args[1]!;
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("Request path must be absolute");
  await trustedParent(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.uid !== process.getuid?.() ||
      (state.mode & 0o077) !== 0 || state.size > 16_384) throw new Error("Request file must be private");
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!bytes.equals(json(parsed))) throw new Error("Request JSON must be canonical");
  const request = keys(parsed, ["scope", "bindings"], "request");
  const result = await exportRssSep24Selected({ outputRoot: args[3]!, scope: request.scope as RssSep24PinnedScope,
    bindings: request.bindings as readonly unknown[] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(() => { process.stderr.write("RSS Sep24 source export failed. No source payload logged.\n");
    process.exitCode = 1; });
}
