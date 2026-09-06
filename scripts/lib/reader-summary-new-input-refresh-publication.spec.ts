import { lockRefreshAuthority } from "./reader-summary-new-input-refresh-postgres";
import { refreshPublicationGuard } from "./reader-summary-new-input-refresh-execution";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";

describe("historical refresh canonical publisher transaction guard", () => {
  const command = (cutoff = refreshManifest().observedThrough) => ({
    finalJob: { toSnapshot: () => ({ id: "new-job" }) },
    artifact: { toSnapshot: () => ({ sourceWindow: { ingestionCutoff: new Date(cutoff) } }) },
  }) as unknown as ReaderSummaryPublicationCommand;
  it.each(["old-slot", "engagement", "policy-config", "expired-review", "fence"])(
    "fails publication on %s drift after generation", async (reason) => {
      const tx = { $executeRaw: jest.fn(async () => 0) } as unknown as PrismaReaderSummaryClient;
      const current = jest.fn(async (client) => { expect(client).toBe(tx); throw new Error(reason); });
      const guard = refreshPublicationGuard({ assertProtected: lockRefreshAuthority, assertLocal: () => {
        if (["expired-review", "fence"].includes(reason)) throw new Error(reason);
      }, assertCurrent: current, manifest: refreshManifest(), jobId: "new-job" });
      await expect(guard(tx, command())).rejects.toThrow(reason);
      if (!["expired-review", "fence"].includes(reason)) {
        expect((tx as unknown as { $executeRaw: jest.Mock }).$executeRaw.mock.calls[0]![0].join("")).toContain("source_item_engagement_observations");
      }
    });
  it("requires real transaction locking and the frozen candidate cutoff", async () => {
    const guard = refreshPublicationGuard({ assertProtected: lockRefreshAuthority, assertLocal: () => undefined,
      assertCurrent: async () => undefined, manifest: refreshManifest(), jobId: "new-job" });
    await expect(guard({} as PrismaReaderSummaryClient, command())).rejects.toThrow(/lock-capable/);
    await expect(guard({ $executeRaw: async () => 0 } as unknown as PrismaReaderSummaryClient,
      command("2026-09-05T22:10:00.000Z"))).rejects.toThrow(/cutoff/);
  });
});
