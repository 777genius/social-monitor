import type { Pool } from "pg";

import {
  githubTrendingCandidateFieldBounds as bounds,
  githubTrendingCandidateJsonByteLimit,
  githubTrendingCandidateRowJsonByteLimit,
  githubTrendingDurableSnapshotCandidatesFitBudget as fits,
} from "./github-trending-durable-snapshot-candidate-budget";
import { richCandidates, scope } from "./github-trending-durable-snapshot-budget-fixture";
import {
  InMemoryGitHubTrendingDurableSnapshotReader,
  PrismaGitHubTrendingDurableSnapshotReader,
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotCandidate as Candidate,
  type GitHubTrendingDurableSnapshotReader as Reader,
} from "./github-trending-durable-snapshot-reuse";

const reuse = (reader: Reader) => reuseGitHubTrendingDurableSnapshot({
  reader, ...scope, requestedUtcDay: "2026-09-07",
  observedThrough: new Date("2026-09-08T00:56:39.850Z"),
});
const memory = (rows: Candidate[]) => new InMemoryGitHubTrendingDurableSnapshotReader(rows);
const prismaRow = (row: Candidate) => ({
  ...row, rank: String(row.rank), starsGained: String(row.starsGained),
  totalStars: String(row.totalStars), sourceTitleBytes: String(row.sourceTitleBytes),
  feedTitleBytes: String(row.feedTitleBytes), bodyPreviewBytes: String(row.bodyPreviewBytes),
  publishedAt: new Date(row.publishedAt), sourcePublishedAt: new Date(row.sourcePublishedAt),
  feedObservedAt: new Date(row.feedObservedAt), sourceObservedAt: new Date(row.sourceObservedAt),
});
const prisma = (rows: Candidate[]) => {
  const query = jest.fn().mockResolvedValue({ rows: rows.map(prismaRow) });
  return { query, reader: new PrismaGitHubTrendingDurableSnapshotReader({ query } as unknown as Pick<Pool, "query">) };
};

describe("GitHub accumulated candidate allocation budget", () => {
  it.each([14, 15, 20])("admits %i rich ten-row captures with the identical latest-ten proof", async (count) => {
    const original = richCandidates();
    expect(Buffer.byteLength(JSON.stringify(original), "utf8")).toBe(342_536);
    const rows = richCandidates(count);
    expect(Buffer.byteLength(JSON.stringify(rows), "utf8")).toBeGreaterThan(262_144);
    const latest = rows.slice(-10);
    const expected = await reuse(memory(latest));
    const database = prisma(rows);
    expect(await reuse(database.reader)).toEqual(expected);
    expect(await reuse(memory(rows.reverse()))).toEqual(expected);
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls[0]?.[1]?.[5]).toBe(201);
    expect(expected.rows).toHaveLength(10);
    expect(expected.group.scanJobId).toBe(latest[0]!.scanJobId);
    if (count === 15) {
      // Captured with the unchanged audited reader on these same latest ten rows.
      expect(expected.proofSha256).toBe("sha256:425e9c71ca1e1c25da6dc9dc258de95fa28958aced8114ff1d00a5bb43ccf7cc");
    }
  });

  it("keeps every SQL result field independently bounded in the single statement", async () => {
    const database = prisma(richCandidates());
    await reuse(database.reader);
    const sql = database.query.mock.calls[0]?.[0] as string;
    const projections = [...sql.matchAll(/^ {4}(.+) as "(\w+)"[,]?$/gmu)];
    expect(projections).toHaveLength(Object.keys(bounds).length);
    const dates = new Set(["publishedAt", "sourcePublishedAt", "feedObservedAt", "sourceObservedAt"]);
    for (const [, expression, alias] of projections) {
      const key = alias as keyof typeof bounds;
      const bound = bounds[key];
      if (bound === "number") {
        expect(expression).toMatch(/(?:left\(.+, 32\)|octet_length\(.+\)::text)$/u);
      } else if (bound === 36) {
        expect(expression).toMatch(/(?:\w+\.\w+::text|coalesce\(\w+\.\w+::text, ''\))$/u);
      } else if (dates.has(key)) {
        expect(expression).toMatch(/^(?:fi|si)\.(?:published_at|observed_at)$/u);
      } else {
        expect(expression!.startsWith("left(")).toBe(true);
        expect(expression!.endsWith(`, ${bound})`)).toBe(true);
      }
    }
    expect(sql).toContain("left join scan_jobs");
    expect(sql).toContain("order by fi.id asc\n  limit $6");
    expect(sql).not.toMatch(/(?:status\s*=|limit 10)/iu);
    expect(sql.match(/>= \$4(?:::timestamptz|::text)/gu)).toHaveLength(6);
    expect(sql).toContain("or si.source_binding_id = $3::uuid");
  });

  it("rejects 201 before visiting any row or serializing an array", () => {
    const rows = Array.from({ length: 201 }, () => new Proxy({} as Candidate, {
      ownKeys: () => { throw new Error("must reject count first"); },
    }));
    expect(fits(rows)).toBe(false);
  });

  it("derives an attainable exact JSON byte ceiling and rejects ceiling +1", () => {
    const worst = Object.fromEntries(Object.entries(bounds).map(([key, bound]) =>
      [key, bound === "number" ? -0.0000012345678901234567 : "\u0001".repeat(bound)],
    )) as Candidate;
    const rowBytes = Buffer.byteLength(JSON.stringify(worst), "utf8");
    expect(rowBytes).toBe(githubTrendingCandidateRowJsonByteLimit);
    const rows = Array.from({ length: 200 }, () => worst);
    expect(Buffer.byteLength(JSON.stringify(rows), "utf8")).toBe(githubTrendingCandidateJsonByteLimit);
    expect(fits(rows)).toBe(true);
    // Replacing a six-byte escape with seven ASCII bytes adds exactly one byte.
    const overflow = { ...worst, bodyPreview: worst.bodyPreview.slice(1) + "abcdefg" };
    const tooLarge = [...rows.slice(1), overflow];
    expect(Buffer.byteLength(JSON.stringify(tooLarge), "utf8")).toBe(githubTrendingCandidateJsonByteLimit + 1);
    expect(fits(tooLarge)).toBe(false);
  });

  it.each(Object.entries(bounds).filter((entry) => typeof entry[1] === "number"))(
    "bounds %s by code points before JSON allocation", (key, bound) => {
      const row = richCandidates()[0]!;
      const cap = bound as number;
      for (const character of ["a", "é", "界", "😀", "\u0001", "\ud800", '"', "\\", "\n"]) {
        expect(fits([{ ...row, [key]: character.repeat(cap) }])).toBe(true);
        expect(fits([{ ...row, [key]: character.repeat(cap + 1) }])).toBe(false);
      }
    },
  );

  it("rejects malformed shape and extra payload before serialization", () => {
    const row = richCandidates()[0]!;
    expect(fits([{ ...row, extra: "payload" } as Candidate])).toBe(false);
    expect(fits([{ ...row, rank: {} } as unknown as Candidate])).toBe(false);
    expect(fits([{ ...row, feedTitle: undefined } as unknown as Candidate])).toBe(false);
    expect(fits([{ ...row, feedTitle: "a".repeat(1_000_000) }])).toBe(false);
  });

  it.each([
    ["scanJobStatus", "FAILED", "selected_group_invalid"],
    ["scanJobStatus", "", "selected_group_invalid"],
    ["feedStatus", "HIDDEN", "selected_group_invalid"],
    ["feedTitle", "different title", "selected_group_invalid"],
    ["sourceContentHash", "z".repeat(64), "selected_group_invalid"],
    ["bodyPreview", "bad\u0001text", "selected_group_invalid"],
    ["feedSnapshotSourceBindingId", "wrong-binding", "selected_group_invalid"],
    ["checkedAt", "2026-09-07T14:01:00.000", "invalid_ordering_identity"],
  ])("keeps newest %s invalid with older valid captures present", async (key, value, error) => {
    const rows = richCandidates().map((row, index) => index >= 140 ? { ...row, [key]: value } : row);
    await expect(reuse(memory(rows))).rejects.toThrow(error);
    await expect(reuse(prisma(rows).reader)).rejects.toThrow(error);
  });

  it("keeps newest incomplete and malformed older ordering blocking", async () => {
    const rows = richCandidates();
    await expect(reuse(memory(rows.slice(0, -1)))).rejects.toThrow("partial_group");
    rows[0] = { ...rows[0]!, feedCheckedAt: "2026-09-07T00:01:00.000" };
    await expect(reuse(memory(rows))).rejects.toThrow("invalid_ordering_identity");
  });

  it("does not confuse equal-length text, Unicode normalization, or sentinel truncation", async () => {
    const rows = richCandidates().slice(-10);
    for (const [sourceTitle, feedTitle] of [["abc", "abd"], ["é", "é"]]) {
      const changed = rows.map((row) => ({ ...row, sourceTitle: sourceTitle!, feedTitle: feedTitle!,
        sourceTitleBytes: Buffer.byteLength(sourceTitle!), feedTitleBytes: Buffer.byteLength(feedTitle!),
      }));
      await expect(reuse(memory(changed))).rejects.toThrow("selected_group_invalid");
    }
    for (const key of ["feedProviderKey", "sourceProviderKey", "feedStatus", "scanJobStatus"] as const) {
      const changed = rows.map((row) => ({ ...row, [key]: (row[key] + "x".repeat(100)).slice(0, bounds[key]) }));
      await expect(reuse(prisma(changed).reader)).rejects.toThrow("selected_group_invalid");
    }
  });

  it("retains UTF-8 text limits, controls and exact declared lengths", async () => {
    const rows = richCandidates().slice(-10);
    for (const text of ["😀".repeat(129), "x".repeat(513), "bad\u007ftext"]) {
      const changed = rows.map((row) => ({ ...row, sourceTitle: text, feedTitle: text,
        sourceTitleBytes: Buffer.byteLength(text), feedTitleBytes: Buffer.byteLength(text),
      }));
      await expect(reuse(memory(changed))).rejects.toThrow("selected_group_invalid");
    }
    const text = "😀".repeat(128);
    const valid = rows.map((row) => ({ ...row, sourceTitle: text, feedTitle: text,
      sourceTitleBytes: 512, feedTitleBytes: 512, bodyPreview: "x".repeat(4096), bodyPreviewBytes: 4096,
    }));
    expect((await reuse(memory(valid))).rows[0]?.titleBytes).toBe(512);
    await expect(reuse(memory(valid.map((row) => ({ ...row, bodyPreview: row.bodyPreview + "x", bodyPreviewBytes: 4097 }))))).rejects.toThrow("selected_group_invalid");
    await expect(reuse(memory(valid.map((row) => ({ ...row, feedTitleBytes: 511 }))))).rejects.toThrow("selected_group_invalid");
  });
});
