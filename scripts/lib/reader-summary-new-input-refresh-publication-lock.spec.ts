import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { withRefreshPublicationLocks } from "./reader-summary-new-input-refresh-publication-lock";

const holderRows = [{ pid: 7, vxid: "7/11" }];
describe("refresh snapshot protection", () => {
  it("sees a writer commit before validation, with two slots and no nested ALS transaction", async () => {
    const context = new AsyncLocalStorage<string>();
    const order: string[] = [];
    let committedPolicy = "reviewed", locked = false, active = 0, peak = 0;
    const summary = { $transaction: async <T>(work: (tx: PrismaReaderSummaryClient) => Promise<T>) => {
      expect(context.getStore()).toBeUndefined();
      const name = active === 0 ? "holder" : "publisher";
      active++; peak = Math.max(peak, active);
      // Both connections may establish snapshots via tenant/deadline SELECTs.
      const snapshot = committedPolicy;
      if (name === "holder") committedPolicy = "writer committed";
      else { expect(locked).toBe(true); order.push("publisher snapshot"); }
      try {
        return await context.run(name, () => work({
          $executeRaw: async () => { locked = true; order.push(`${name} locks`); return 0; },
          $queryRaw: async (sql: TemplateStringsArray) => {
            if (sql.join("").includes("select exists")) return [{ held: true }];
            return name === "holder" ? holderRows : [{ policy: snapshot }];
          },
        } as unknown as PrismaReaderSummaryClient));
      } finally { order.push(`${name} end`); active--; }
    } };
    await withRefreshPublicationLocks(summary, async (assertProtected) => summary.$transaction(async (tx) => {
      await assertProtected(tx);
      expect(await tx.$queryRaw`policy`).toEqual([{ policy: "writer committed" }]);
    }));
    expect(peak).toBe(2); expect(active).toBe(0);
    expect(order).toEqual(["holder locks", "publisher snapshot", "publisher locks", "publisher end", "holder end"]);
  });

  it.each(["source_item_engagement_snapshots", "source_items", "feed_items", "reader_summary_policies"])(
    "a %s writer rejects acquisition without waiting, publishing or retaining partial locks", async (busy) => {
      const held: string[] = [];
      const publish = jest.fn();
      const summary = { $transaction: async <T>(work: (tx: PrismaReaderSummaryClient) => Promise<T>) => {
        try {
          return await work({ $executeRaw: async (sql: TemplateStringsArray) => {
            const text = sql.join("");
            expect(text).toMatch(/share mode nowait/iu);
            for (const table of text.replace(/^lock table\s+/u, "").split(/,| in share/iu)) {
              if (table.trim() === busy) throw new Error("55P03 lock unavailable");
              held.push(table.trim());
            }
            return 0;
          } } as unknown as PrismaReaderSummaryClient);
        } finally { held.length = 0; }
      } };
      await expect(withRefreshPublicationLocks(summary, publish)).rejects.toThrow(/55P03/);
      expect(publish).not.toHaveBeenCalled(); expect(held).toEqual([]);
    });

  it("rejects lost server locks even before the holder failure notification arrives", async () => {
    let ended = false;
    const summary = { $transaction: async <T>(work: (tx: PrismaReaderSummaryClient) => Promise<T>) => {
      try { return await work({ $executeRaw: async () => 0, $queryRaw: async () => holderRows } as unknown as PrismaReaderSummaryClient); }
      finally { ended = true; }
    } };
    const candidate = { $executeRaw: async () => 0, $queryRaw: async () => [{ held: false }] } as unknown as PrismaReaderSummaryClient;
    await expect(withRefreshPublicationLocks(summary, (protect) => protect(candidate))).rejects.toThrow(/protection was lost/);
    expect(ended).toBe(true);
  });

  it("releases its transaction on publisher failure", async () => {
    let ended = false;
    const summary = { $transaction: async <T>(work: (tx: PrismaReaderSummaryClient) => Promise<T>) => {
      try { return await work({ $executeRaw: async () => 0, $queryRaw: async () => holderRows } as unknown as PrismaReaderSummaryClient); }
      finally { ended = true; }
    } };
    await expect(withRefreshPublicationLocks(summary, async () => { throw new Error("publication rejected"); })).rejects.toThrow(/publication rejected/);
    expect(ended).toBe(true);
  });
});
