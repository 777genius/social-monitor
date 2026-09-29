/** Source-only Reddit Sep 24 candidate export. No persistence or production services. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { HttpRedditClient } from "../libs/ingestion/adapters/source/reddit/http-reddit-client";
import type { RedditClientPort, RedditListingPage, RedditPost } from "../libs/ingestion/adapters/source/reddit/reddit-client.port";
import { normalizePost } from "../libs/ingestion/adapters/source/reddit/reddit-post-normalizer";
import { readListing, readOptionalNonNegativeInteger, readScanPasses, readSearchSort, type RedditScanPass } from "../libs/ingestion/adapters/source/reddit/reddit-source-support";

const from = "2026-09-24T00:00:00.000Z";
const to = "2026-09-25T00:00:00.000Z";
const startSeconds = Date.parse(from) / 1000;
const endSeconds = Date.parse(to) / 1000;
const maxPagesPerPass = 20;

type Binding = Readonly<{ sourceBindingId: string; config: Readonly<Record<string, unknown>> }>;
type PassEvidence = Readonly<{
  passIndex: number;
  mode: "listing" | "search";
  pages: number;
  postsSeen: number;
  inWindow: number;
  exported: number;
  terminal: boolean;
  stopReason: "cursor_exhausted" | "page_cap" | "cursor_repeated" | "request_failed";
}>;

export type RedditSep24Export = Readonly<{
  window: { startInclusive: string; endExclusive: string };
  source: "reddit_oauth_listing";
  coverage: "unproven";
  bindings: readonly Readonly<{
    sourceBindingId: string;
    terminal: boolean;
    passes: readonly PassEvidence[];
    items: readonly Readonly<{ externalId: string; canonicalUrl: string; title: string; body: string; publishedAt: string; metadata: unknown }>[];
  }>[];
}>;

const record = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return value as Readonly<Record<string, unknown>>;
};

/** Credentials belong only in the operator's process environment. */
export function parseRedditSep24Bindings(value: unknown): readonly Binding[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new Error("Expected 1 to 100 bindings");
  const seen = new Set<string>();
  return value.map((entry) => {
    const input = record(entry);
    const sourceBindingId = input.sourceBindingId;
    if (typeof sourceBindingId !== "string" || sourceBindingId.trim() === "" || seen.has(sourceBindingId)) {
      throw new Error("Binding IDs must be distinct nonempty strings");
    }
    seen.add(sourceBindingId);
    const config = record(input.config);
    rejectCredentials(config);
    configuredPasses(config);
    return { sourceBindingId, config };
  });
}

const rejectCredentials = (value: unknown): void => {
  if (Array.isArray(value)) return value.forEach(rejectCredentials);
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/token|secret|password|credential|authorization|apiKey/iu.test(key)) {
      throw new Error("Binding configuration contains a credential field");
    }
    rejectCredentials(child);
  }
};

const configuredPasses = (config: Readonly<Record<string, unknown>>): readonly RedditScanPass[] => {
  const raw = config.scanPasses ?? config.passes;
  if (raw !== undefined) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 48) throw new Error("Expected 1 to 48 scan passes");
    return readScanPasses(config);
  }
  const mode = config.mode === "listing" ? "listing" : "search";
  if (mode === "listing") {
    const subreddit = config.subreddit ?? config.query;
    if (typeof subreddit !== "string" || subreddit.trim() === "") throw new Error("Listing binding requires subreddit");
    return [{ mode, subreddit, listing: readListing(config.listing) }];
  }
  const query = config.query ?? config.term;
  if (typeof query !== "string" || query.trim() === "") throw new Error("Search binding requires query");
  return [{ mode, query, searchSort: readSearchSort(config.searchSort) }];
};

const validPost = (post: RedditPost): boolean =>
  /^[a-z0-9]+$/u.test(post.id) && post.name === `t3_${post.id}` &&
  post.createdUtc !== undefined && Number.isFinite(post.createdUtc) &&
  post.createdUtc >= startSeconds && post.createdUtc < endSeconds;

/** Every pass follows its own OAuth cursor. Terminal means the API returned no next cursor. */
export async function exportRedditSep24Public(
  bindings: readonly Binding[], client: RedditClientPort, accessToken: string, userAgent: string,
): Promise<RedditSep24Export> {
  if (!accessToken.trim() || !userAgent.trim()) throw new Error("Runtime OAuth token and user agent are required");
  const results: RedditSep24Export["bindings"][number][] = [];
  for (const binding of bindings) {
    const passes = configuredPasses(binding.config);
    const minScore = readOptionalNonNegativeInteger(binding.config.minScore, 1_000_000);
    const items = new Map<string, RedditSep24Export["bindings"][number]["items"][number]>();
    const evidence: PassEvidence[] = [];
    for (const [passIndex, pass] of passes.entries()) {
      let cursor: string | undefined;
      const cursors = new Set<string>();
      let pages = 0;
      let postsSeen = 0;
      let inWindow = 0;
      let exported = 0;
      let stopReason: PassEvidence["stopReason"] = "page_cap";
      for (; pages < maxPagesPerPass;) {
        let page: RedditListingPage;
        try {
          page = pass.mode === "listing"
            ? await client.listSubredditPosts({ accessToken, userAgent, subreddit: pass.subreddit,
                listing: pass.listing, topTime: pass.listing === "top" ? "all" : undefined,
                limit: 100, after: cursor })
            : await client.searchPosts({ accessToken, userAgent, query: pass.query,
                sort: "new", time: "all", limit: 100, after: cursor });
        } catch {
          stopReason = "request_failed";
          break;
        }
        pages += 1;
        postsSeen += page.posts.length;
        const allowed = pass.mode === "search" && pass.allowedSubreddits?.length
          ? new Set(pass.allowedSubreddits.map((name) => name.toLowerCase())) : undefined;
        for (const post of page.posts) {
          if (!validPost(post) || (allowed && !allowed.has(post.subreddit?.toLowerCase() ?? ""))) continue;
          inWindow += 1;
          const item = normalizePost(post, pass.minScore ?? minScore)[0];
          if (item === undefined || items.has(item.externalId)) continue;
          items.set(item.externalId, { externalId: item.externalId, canonicalUrl: item.canonicalUrl,
            title: item.title, body: item.body, publishedAt: item.publishedAt.toISOString(), metadata: item.metadata });
          exported += 1;
        }
        if (page.after === undefined) {
          stopReason = "cursor_exhausted";
          break;
        }
        if (page.after.trim() === "" || page.after === cursor || cursors.has(page.after)) {
          stopReason = "cursor_repeated";
          break;
        }
        cursors.add(page.after);
        cursor = page.after;
      }
      evidence.push({ passIndex, mode: pass.mode, pages, postsSeen, inWindow, exported,
        terminal: stopReason === "cursor_exhausted", stopReason });
    }
    results.push({ sourceBindingId: binding.sourceBindingId,
      terminal: evidence.every((pass) => pass.terminal), passes: evidence,
      items: [...items.values()].sort((left, right) => left.externalId.localeCompare(right.externalId)) });
  }
  return { window: { startInclusive: from, endExclusive: to }, source: "reddit_oauth_listing",
    coverage: "unproven", bindings: results };
}

export async function runRedditSep24PublicCli(
  args: readonly string[],
  environment: Readonly<{ REDDIT_ACCESS_TOKEN?: string; REDDIT_USER_AGENT?: string }>,
  client: RedditClientPort,
): Promise<0 | 2> {
  const [bindingsPath, outputPath] = args;
  if (!bindingsPath || !outputPath || args.length !== 2) {
    throw new Error("Usage: ts-node scripts/export-reddit-sep24-public.ts BINDINGS_JSON OUTPUT_JSON");
  }
  const bindings = parseRedditSep24Bindings(JSON.parse(await readFile(resolve(bindingsPath), "utf8")));
  const token = environment.REDDIT_ACCESS_TOKEN;
  const userAgent = environment.REDDIT_USER_AGENT;
  if (!token || !userAgent) throw new Error("REDDIT_ACCESS_TOKEN and REDDIT_USER_AGENT are required in the process environment");
  const result = await exportRedditSep24Public(bindings, client, token, userAgent);
  await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return result.bindings.some((binding) => !binding.terminal) ? 2 : 0;
}

if (typeof require !== "undefined" && require.main === module) {
  void runRedditSep24PublicCli(process.argv.slice(2), process.env, new HttpRedditClient()).then((code) => {
    process.exitCode = code;
  }).catch(() => {
    // Error details and process environment never reach stdout or stderr.
    process.stderr.write("Reddit Sep24 export failed; check input and output paths or runtime access.\n");
    process.exitCode = 1;
  });
}
