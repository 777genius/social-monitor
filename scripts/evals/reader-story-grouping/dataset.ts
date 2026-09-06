import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SummaryEvidenceItem } from "@social-monitor/summary/domain";

export const BASE = "e83b577f85d3f287055dc0a6154bef6a35b50bd2";
export const FIXTURES = "test/evals/reader-story-grouping";
export const RESULTS = ".cache/real-story-grouping-eval";
export const sha = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
export const fileSha = (path: string): string => sha(readFileSync(path));
export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
export const readLines = <T>(path: string): T[] => readFileSync(path, "utf8")
  .trim().split("\n").map((line) => JSON.parse(line) as T);
export const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};
export type GoldCase = {
  id: string; blockId: string; left: string; right: string;
  semanticRelation: "same_story" | "related_topic" | "unrelated" | "ambiguous";
  productAction: "merge_if_admitted" | "keep_separate" | "unscored";
  scored: boolean; stratum: string; rationaleRu: string;
};
export type Block = { id: string; postRefs: string[]; context: string };
export type Post = {
  ref: string; feedItemId: string; providerKey: string; canonicalUrl: string;
  title: string; sourceText?: string; bodyPreview?: string; authorHandle?: string;
  publishedAt: string; observedAt: string; frozenEvidenceSha256: string;
  sourceTextSha256: string;
};
export type ReplayRow = {
  ref: string; day: string; evidence: SummaryEvidenceItem;
  sourceWindow: {
    startedAt: Date; endedAt: Date; periodStartedAt: Date;
    periodEndedAt: Date; ingestionCutoff: Date;
  };
  originalFrozenEvidenceSha256: string;
};
const dateKeys = new Set([
  "publishedAt", "observedAt", "ingestionCutoff", "startedAt", "endedAt",
  "periodStartedAt", "periodEndedAt", "checkedAt", "windowStartedAt", "windowEndedAt",
]);
export const reviveReplay = (text: string): ReplayRow => JSON.parse(text,
  (key: string, value: unknown) => dateKeys.has(key) && typeof value === "string"
    ? new Date(value) : value,
) as ReplayRow;

export const loadDataset = (root = FIXTURES) => {
  const seal = readJson<{
    sourceRevision: string; captureSha256: string; frozenAt: string;
    files: Record<string, string>;
  }>(join(root, "label-seal.json"));
  check(seal.sourceRevision === BASE, "Unexpected source revision");
  for (const [name, hash] of Object.entries(seal.files)) {
    check(fileSha(join(root, name)) === hash, `Frozen label/evidence mismatch: ${name}`);
  }
  const replaySeal = readJson<{ labelSealSha256: string; replaySha256: string }>(join(root, "replay-seal.json"));
  const labelSealSha256 = fileSha(join(root, "label-seal.json"));
  check(labelSealSha256 === replaySeal.labelSealSha256, "Label seal identity mismatch");
  check(fileSha(join(root, "replay.jsonl")) === replaySeal.replaySha256, "Replay fixture mismatch");
  const posts = readLines<Post>(join(root, "posts.jsonl"));
  const cases = readJson<GoldCase[]>(join(root, "cases.json"));
  const blocks = readJson<Block[]>(join(root, "blocks.json"));
  const replay = readFileSync(join(root, "replay.jsonl"), "utf8").trim().split("\n").map(reviveReplay);
  const postByRef = new Map(posts.map((p) => [p.ref, p]));
  const replayByRef = new Map(replay.map((p) => [p.ref, p]));
  check(postByRef.size === posts.length, "Duplicate post ref");
  check(new Set(cases.map((c) => c.id)).size === cases.length, "Duplicate case id");
  const pairIds = new Set<string>();
  for (const c of cases) {
    const a = postByRef.get(c.left); const b = postByRef.get(c.right);
    check(a && b && a.feedItemId !== b.feedItemId, `Unknown/self pair ${c.id}`);
    const key = [c.left, c.right].sort().join("|");
    check(!pairIds.has(key), `Repeated gold pair ${c.id}`); pairIds.add(key);
    const block = blocks.find((v) => v.id === c.blockId);
    check(block?.postRefs.includes(c.left) && block.postRefs.includes(c.right), `Case outside context ${c.id}`);
    check(c.scored === (c.semanticRelation !== "ambiguous"), `Invalid scoring ${c.id}`);
    if (c.scored) check(a?.sourceText && b?.sourceText, `Title-only gold ${c.id}`);
  }
  for (const p of posts) {
    check(sha(p.sourceText ?? "") === p.sourceTextSha256, `Text hash ${p.ref}`);
    const row = replayByRef.get(p.ref);
    check(row?.originalFrozenEvidenceSha256 === p.frozenEvidenceSha256, `Capture identity ${p.ref}`);
    for (const key of ["title", "sourceText", "canonicalUrl"] as const) {
      check(row?.evidence[key] === p[key], `Replay public text ${p.ref}:${key}`);
    }
    check(row?.evidence.observedAt.toISOString() === p.observedAt, `Changed observedAt ${p.ref}`);
    check(row?.evidence.publishedAt.toISOString() === p.publishedAt, `Changed publishedAt ${p.ref}`);
  }
  return { posts, cases, blocks, replayByRef, postByRef, seal, labelSealSha256, replaySeal };
};
export type Dataset = ReturnType<typeof loadDataset>;

export const assertSource = (): void => {
  check(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === BASE, "HEAD differs from authoritative base");
  const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim();
  check(changed === "", "Tracked source differs from base; eval expects additive owned files only");
};
export const ownedSourceFiles = (): string[] => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  return [...walk(FIXTURES), ...walk("scripts/evals/reader-story-grouping")].sort();
};
