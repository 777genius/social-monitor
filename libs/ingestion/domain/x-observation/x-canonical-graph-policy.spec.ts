import { createHash } from "node:crypto";
import { lstatSync, readlinkSync, readFileSync } from "node:fs";
import { proposedBounds, proposedSendLimit, type CanonicalInvocation, type RetainedDescriptor } from "./x-canonical-graph-policy";

const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 7, 30 + i)).toISOString().slice(0, 10));
const hash = "a".repeat(64);
function invocations(): CanonicalInvocation[] {
  return days.map((day, i) => {
    const invocationId = `${day}/l0/i0`, passId = `${invocationId}/p0`;
    return { invocationId, laneId: `${day}/l0`, ordinal: 0, requestHash: hash, request: {}, continuationPolicy: "canonical-no-external-cursor-at-source-pin",
      passes: [{ passId, ordinal: 0, label: "top_base", product: "top", limit: 50, minLikes: 30, minRetweets: 0,
        minReplies: 0, globalStopScope: passId, stopRuleSourceHash: hash, budgetSelectionSourceHash: hash,
        streams: Array.from({ length: i + 1 }, (_, splitOrdinal) => ({ streamId: `${passId}/s${splitOrdinal}`,
          passId, splitOrdinal, splitWindow: { since: day, until: day }, rawQuery: "synthetic",
          rawQueryHash: hash, normalizedRequestHash: hash, parametersWithoutCursor: {}, parametersHash: hash,
          publicUrl: "https://fixture.invalid", profileHash: hash, product: "Top", pageLimit: 5 })) }] };
  });
}

describe("detached canonical coordinates and proposed maxima", () => {
  it("includes every retained and supplementary coordinate without a minimum-send claim", () => {
    const retained: RetainedDescriptor[] = days.flatMap((day, i) => Array.from({ length: i }, (_, j) =>
      ({ day, streamId: `${day}/retained${j}`, pageLimit: 5, descriptorHash: hash })));
    const result = proposedBounds(days, invocations(), retained, "synthetic-amendment", hash);
    expect(result).toMatchObject({ ok: true, value: { totalSendLimit: 287, pageLimit: 5, count: 20,
      bootstrap: 6, redirects: 2, requestMs: 10000, candidateDay: 800, candidateTotal: 5600, dayMs: 600000, totalMs: 4200000 } });
    if (result.ok) expect(result.value.days.map((day) => day.sendLimit)).toEqual([11, 21, 31, 41, 51, 61, 71]);
    expect(proposedSendLimit(150, 0)).toEqual({ ok: true, value: 756 });
    expect(proposedSendLimit(165, 0)).toEqual({ ok: true, value: 831 });
    expect(proposedSendLimit(0, 0)).toEqual({ ok: true, value: 6 });
  });
  it("rejects unsafe arithmetic, collisions, reordering and unknown retained days", () => {
    for (const n of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(proposedSendLimit(n, 0).ok).toBe(false);
    const graph = invocations(), first = graph[0]!.passes[0]!.streams[0]!;
    expect(proposedBounds(days, graph, [{ day: days[0]!, streamId: first.streamId, pageLimit: 5, descriptorHash: hash }], "proposal", hash))
      .toMatchObject({ ok: false, error: { code: "DUPLICATE_COORDINATE" } });
    const reordered = graph.map((invocation) => ({ ...invocation,
      passes: invocation.passes.map((pass) => ({ ...pass, streams: [...pass.streams].reverse() })) }));
    expect(proposedBounds(days, reordered, [], "proposal", hash).ok).toBe(false);
    expect(proposedBounds(days, graph, [{ day: "2026-01-01", streamId: "retained", pageLimit: 5, descriptorHash: hash }], "proposal", hash).ok).toBe(false);
    expect(proposedBounds(days, graph, [], "", hash)).toMatchObject({ ok: false, error: { code: "UNAPPROVED_AMENDMENT" } });
  });
  it("preserves every tracked main baseline byte and mode, without unreleased ancestry", () => {
    // Exact git ls-tree -rz 8df17ed6eb2a6bc72e25cd1c0f40bbb6083dcc4c.
    // Sealed source evidence works in depth-one checkouts and source archives.
    expect(lstatSync("test/fixtures/x-canonical/baseline.ls-tree.json").isSymbolicLink()).toBe(false);
    const representation = readFileSync("test/fixtures/x-canonical/baseline.ls-tree.json");
    expect(createHash("sha256").update(representation).digest("hex")).toBe(
      "cbd19c8d28d68f35a1966af6f847e0228c95962c374edca8cf02aae8f615b5c7");
    const tuples = JSON.parse(representation.toString("utf8")) as
      { path: string; mode: string; kind: string; blob: string }[];
    expect(tuples).toHaveLength(6314);
    const baseline = Buffer.from(tuples.map(({ path, mode, kind, blob }) =>
      `${mode} ${kind} ${blob}\t${path}\0`).join(""), "utf8");
    expect(baseline.length).toBe(794718);
    expect(createHash("sha256").update(baseline).digest("hex")).toBe(
      "894d8c18f89ca18e67c894bef02145f7566c18f4fe9d4c1f488713126b960e07");
    const entries = baseline.toString("utf8").split("\0").filter(Boolean);
    expect(entries).toHaveLength(6314);
    for (const entry of entries) {
      const [header, path] = entry.split("\t");
      const [mode, kind, expected] = header!.split(" ");
      expect(kind).toBe("blob");
      const stat = lstatSync(path!);
      const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(path!)) : readFileSync(path!);
      const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      expect({ path, hash: actual }).toEqual({ path, hash: expected });
      expect(stat.isSymbolicLink() ? "120000" : (stat.mode & 0o111) ? "100755" : "100644").toBe(mode);
    }
  });
});
