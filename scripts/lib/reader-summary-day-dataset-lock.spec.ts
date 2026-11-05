import { ReaderSummaryDayDatasetGuard } from "./reader-summary-day-dataset-guard";
import { captureReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";

const retainedRelations = [
  "source_item_engagement_snapshots", "source_item_engagement_observations",
  "source_items", "feed_items", "source_bindings", "interests",
  "source_catalog_entries",
];
const normalize = (query: TemplateStringsArray) => query.join("").replace(/\s+/gu, " ").trim();

async function readyGuard(retained: boolean) {
  const now = new Date("2026-09-15T00:05:00.000Z");
  const client = { $queryRaw: jest.fn().mockResolvedValue([]) };
  const manifest = await captureReaderSummaryDayDatasetManifest({
    client: client as never,
    tenantId: "33333333-3333-4333-8333-333333333333",
    workspaceId: "44444444-4444-4444-8444-444444444444",
    startedAt: new Date("2026-09-14T00:00:00.000Z"),
    endedAt: new Date("2026-09-15T00:00:00.000Z"), generatedAt: now,
    ...(retained ? { retainedAuthorityBoundThrough: now } : {}),
  });
  const guard = new ReaderSummaryDayDatasetGuard(client as never, manifest, "f".repeat(64), () => now);
  await guard.assertCurrent("before_evidence_selection");
  await guard.assertCurrent("after_evidence_selection");
  client.$queryRaw.mockClear();
  return { guard, client };
}

describe("dataset publication relation locks", () => {
  it.each([false, true])("requests exactly one complete statement (retained=%s) before reading", async (retained) => {
    const { guard, client } = await readyGuard(retained);
    const execute = jest.fn(async () => {
      expect(client.$queryRaw).not.toHaveBeenCalled();
      return 0;
    });
    await guard.assertCurrentForPublicationTransaction({ ...client, $executeRaw: execute } as never);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(normalize((execute.mock.calls as unknown as [TemplateStringsArray][])[0]![0])).toBe(retained
      ? `lock table ${retainedRelations.join(", ")} in share mode nowait`
      : "lock table feed_items, source_items, source_bindings, interests, source_catalog_entries in share mode");
    expect(client.$queryRaw).toHaveBeenCalled();
    expect(guard.evidence().completedPhases).toContain("before_publication");
  });

  // Deterministic relation-lock contract, not PostgreSQL concurrency evidence.
  // Residual native test: two disposable PostgreSQL sessions, writer holding
  // observations then requesting source/feed, publication aborting with 55P03.
  it.each(retainedRelations)("aborts promptly with a writer holding %s, including later relations", async (conflict) => {
    const { guard, client } = await readyGuard(true);
    const shares = new Set<string>();
    const acquired: string[] = [];
    const waits: string[] = [];
    const lockUnavailable = Object.assign(new Error("lock not available"), { code: "55P03" });
    const execute = jest.fn(async (query: TemplateStringsArray) => {
      const match = /^lock table (.+) in share mode( nowait)?$/u.exec(normalize(query));
      if (!match) throw new Error("Unexpected lock statement");
      for (const relation of match[1]!.split(/,\s*/u)) {
        if (relation === conflict) {
          if (match[2]) throw lockUnavailable;
          waits.push(relation);
          // A waiting publisher keeps its earlier SHARE locks, allowing a cycle
          // with the writer's next source/feed write. Remain pending until timeout.
          await new Promise<void>(() => undefined);
        }
        shares.add(relation);
        acquired.push(relation);
      }
      return 0;
    });
    const publication = (async () => {
      try {
        await guard.assertCurrentForPublicationTransaction({ ...client, $executeRaw: execute } as never);
        return "published";
      } catch (error) {
        return error;
      } finally {
        // Transaction rollback releases every partially acquired lock.
        shares.clear();
      }
    })();
    const nextTurn = new Promise<string>((resolve) => setImmediate(() => resolve("still waiting")));
    expect(await Promise.race([publication, nextTurn])).toBe(lockUnavailable);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(acquired).toEqual(retainedRelations.slice(0, retainedRelations.indexOf(conflict)));
    expect(waits).toEqual([]);
    expect(shares.size).toBe(0); // Writer can now acquire source/feed and finish.
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(guard.evidence().completedPhases).not.toContain("before_publication");
  });
});
