import { FixedClock } from "@social-monitor/shared-kernel";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { assertRefreshTransactionAuthority, refreshPublicationGuard } from "./reader-summary-new-input-refresh-execution";
import { captureRefreshDatabaseAuthority } from "./reader-summary-new-input-refresh-capture";
import { readRefreshPrior, readRefreshJobs } from "./reader-summary-new-input-refresh-postgres";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";

jest.mock("./reader-summary-new-input-refresh-capture", () => ({
  ...jest.requireActual("./reader-summary-new-input-refresh-capture"), captureRefreshDatabaseAuthority: jest.fn(),
}));
jest.mock("./reader-summary-new-input-refresh-postgres", () => ({
  ...jest.requireActual("./reader-summary-new-input-refresh-postgres"), readRefreshPrior: jest.fn(), readRefreshJobs: jest.fn(),
}));
describe("publisher authority uses only its transaction for every database read", () => {
  it.each(["unchanged", "canonicalRowsSha256", "engagementSha256", "sourceScopeSha256", "policySha256", "datasetSha256", "job", "prior"])(
    "checks complete backing authority: %s", async (change) => {
      const m = refreshManifest(), clock = new FixedClock(refreshNow);
      const tx = { $executeRaw: jest.fn(async () => 0) } as unknown as PrismaReaderSummaryClient;
      const { canonicalInputSha256, eligibleCount, ...database } = m.authority;
      void canonicalInputSha256; void eligibleCount;
      jest.mocked(captureRefreshDatabaseAuthority).mockImplementation(async (input) => {
        expect(input.client).toBe(tx);
        return change in database ? { ...database, [change]: "b".repeat(64) } : database;
      });
      jest.mocked(readRefreshPrior).mockImplementation(async (client) => {
        expect(client).toBe(tx); return change === "prior" ? { ...m.prior, proofSha256: "b".repeat(64) } : m.prior;
      });
      jest.mocked(readRefreshJobs).mockImplementation(async (client) => {
        expect(client).toBe(tx); return [{ jobId: "new", operation: m.operation,
          status: change === "job" ? "FAILED" : "RUNNING", artifactId: null }];
      });
      const command = { artifact: { toSnapshot: () => ({ sourceWindow: { ingestionCutoff: new Date(m.observedThrough) } }) },
        finalJob: { toSnapshot: () => ({ id: "new" }) } } as unknown as ReaderSummaryPublicationCommand;
      const guard = refreshPublicationGuard({ manifest: m, jobId: "new", assertLocal: () => undefined,
        assertCurrent: (client) => assertRefreshTransactionAuthority(client, m, "new", clock) });
      if (change === "unchanged") await expect(guard(tx, command)).resolves.toBeUndefined();
      else await expect(guard(tx, command)).rejects.toThrow(/drifted|job authority/);
    });
});
