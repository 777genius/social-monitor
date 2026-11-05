import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { buildReaderSummaryPeriod } from "@social-monitor/summary/domain";

import {
  createReaderSummaryDailyPublicationExecutionWiring,
  createReaderSummaryDailyPublicationWiring,
} from "./reader-summary-daily-publication-finalizer";
import { verifiedUnsupportedDailyReplay } from "./support/reader-summary-unsupported-replay";

const clock = new FixedClock(new Date("2026-08-02T09:30:00.000Z"));
const unsupported = "Daily immutable replay recovery requires output_text";
const forbidden = (name: string) => jest.fn((): never => {
  throw new Error(`Unexpected live dependency: ${name}`);
});

describe("unsupported daily immutable replay", () => {
  it.each([false, true])(
    "rejects verified v1 structured replay before live calls (current authority supplied: %s)",
    async (supplyCurrentAuthority) => {
      const replay = verifiedUnsupportedDailyReplay();
      const list = forbidden("feed list");
      const findById = forbidden("feed item");
      const readPromotionSnapshot = forbidden("feed snapshot");
      const readSourceContent = forbidden("source content");
      const readCurrent = forbidden("current interest");
      const $queryRaw = forbidden("GitHub projection");
      const record = forbidden("attestation sink");
      const select = forbidden("fixture selector");
      const read = forbidden("fixture GitHub reader");
      // Prove the receipt passes the actual persisted-model verifier. A malformed
      // receipt must not accidentally make this boundary regression pass.
      const verified = createReaderSummaryDailyPublicationWiring({
        replay,
        evidenceSelector: { select },
        githubProjectionReader: { read },
        attestationSink: { record },
      });
      expect(replay.authority.schemaVersion).toBe(1);
      expect(verified.model.estimate({} as never, {} as never)).toMatchObject({ inputTokens: 120, outputTokens: 30 });

      const attempt = async () => {
        const wiring = createReaderSummaryDailyPublicationExecutionWiring({
          replay,
          feedItems: { list, findById, readPromotionSnapshot, readSourceContent },
          ...(supplyCurrentAuthority ? { configuredInterests: { readCurrent } } : {}),
          summaryClient: { $queryRaw },
          clock,
          attestationSink: { record },
        });
        // On the unfixed implementation this historical selection reaches the
        // throwing feed fake, reproducing the independent review's live read.
        await wiring.evidenceSelector.select({
          tenantId: tenantId(replay.authority.tenantId),
          workspaceId: workspaceId(replay.authority.workspaceId),
          scope: { type: "workspace" },
          period: buildReaderSummaryPeriod({
            cadence: "daily",
            startedAt: new Date("2026-07-31T00:00:00.000Z"),
            endedAt: new Date("2026-08-01T00:00:00.000Z"),
            timezone: "UTC",
          }),
          maxItems: 200,
          observedThrough: clock.now(),
        });
      };
      await expect(attempt()).rejects.toThrow(unsupported);
      for (const dependency of [list, findById, readPromotionSnapshot,
        readSourceContent, readCurrent, $queryRaw, record, select, read]) {
        expect(dependency).not.toHaveBeenCalled();
      }
    },
  );

  it("rejects before even accessing live construction inputs or fresh capability checks", () => {
    const access = forbidden("live construction input");
    expect(() => createReaderSummaryDailyPublicationExecutionWiring({
      replay: verifiedUnsupportedDailyReplay(),
      get feedItems(): never { return access(); },
      get configuredInterests(): never { return access(); },
      get summaryClient(): never { return access(); },
      get storyRelationVerifier(): never { return access(); },
      clock,
      attestationSink: { record: forbidden("attestation sink") },
    })).toThrow(unsupported);
    expect(access).not.toHaveBeenCalled();
  });
});
