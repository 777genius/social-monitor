import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  PersistedReaderSummaryWeeklyArtifact,
  ReaderSummaryWeeklyProjectionReaderPort,
} from "../../ports";
import { GetReaderSummaryWeeklyProjectionUseCase } from "./get-reader-summary-weekly-projection.use-case";

const tenant = tenantId("00000000-0000-7000-8000-000000000701");
const workspace = workspaceId("00000000-0000-7000-8000-000000000702");
const weekStartedOn = "2026-07-20";
const dates = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.parse(`${weekStartedOn}T00:00:00.000Z`) + index * 86_400_000)
    .toISOString().slice(0, 10),
);
const artifact = Object.freeze({
  kind: "weekly",
}) as unknown as PersistedReaderSummaryWeeklyArtifact;

describe("GetReaderSummaryWeeklyProjectionUseCase", () => {
  it.each([
    [0, null, "unavailable", [
      "certified_daily_evidence_incomplete",
      "active_weekly_certified_artifact_missing",
    ]],
    [0, artifact, "partial", ["certified_daily_evidence_incomplete"]],
    [1, null, "partial", [
      "certified_daily_evidence_incomplete",
      "active_weekly_certified_artifact_missing",
    ]],
    [6, artifact, "partial", ["certified_daily_evidence_incomplete"]],
    [7, null, "partial", ["active_weekly_certified_artifact_missing"]],
    [7, artifact, "complete", []],
  ] as const)(
    "projects %s certified days with artifact %s as %s",
    async (dayCount, weeklyArtifact, status, blockingReasons) => {
      const reader = new FakeWeeklyProjectionReader(
        dates.slice(0, dayCount),
        weeklyArtifact,
      );
      const result = await new GetReaderSummaryWeeklyProjectionUseCase(
        reader,
      ).execute({ tenantId: tenant, workspaceId: workspace, weekStartedOn });

      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          schemaVersion: "reader_summary.weekly_projection.v1",
          tenantId: tenant,
          workspaceId: workspace,
          weekStartedOn,
          weekEndedOn: "2026-07-26",
          status,
          certifiedDailyEvidenceDates: dates.slice(0, dayCount),
          missingDailyEvidenceDates: dates.slice(dayCount),
          blockingReasons,
          activeWeeklyCertifiedArtifactPresent: weeklyArtifact !== null,
          evidenceLimitations: [],
          artifact: status === "complete" ? weeklyArtifact : null,
        }),
      });
      expect(reader.queries).toEqual([{
        tenantId: tenant,
        workspaceId: workspace,
        weekStartedOn,
        weekEndedOn: "2026-07-26",
      }]);
    },
  );

  it.each(["", "2026-7-20", "2026-07-21", "2026-02-30"])(
    "rejects non-Monday exact UTC date %p before persistence",
    async (value) => {
      const reader = new FakeWeeklyProjectionReader([], null);
      const result = await new GetReaderSummaryWeeklyProjectionUseCase(
        reader,
      ).execute({ tenantId: tenant, workspaceId: workspace, weekStartedOn: value });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "validation.failed" },
      });
      expect(reader.queries).toEqual([]);
    },
  );

  it("propagates database failures instead of projecting unavailable", async () => {
    const failure = new Error("database integrity failed");
    const reader: ReaderSummaryWeeklyProjectionReaderPort = {
      read: async () => Promise.reject(failure),
    };

    await expect(new GetReaderSummaryWeeklyProjectionUseCase(reader).execute({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
    })).rejects.toBe(failure);
  });

  it("fails closed for duplicate or out-of-window reader evidence", async () => {
    for (const evidenceDates of [
      [dates[0]!, dates[0]!],
      ["2026-07-19"],
      [dates[1]!, dates[0]!],
    ]) {
      await expect(new GetReaderSummaryWeeklyProjectionUseCase(
        new FakeWeeklyProjectionReader(evidenceDates, null),
      ).execute({
        tenantId: tenant,
        workspaceId: workspace,
        weekStartedOn,
      })).resolves.toMatchObject({
        ok: false,
        error: {
          code: "external.dependency_unavailable",
          message: "Reader summary weekly projection evidence dates are invalid",
        },
      });
    }
  });

  it("preserves a historical evidence limitation only for a certified date", async () => {
    const limitation = {
      requestedUtcDate: dates[0]!,
      providerKey: "github-trending-page" as const,
      evidenceState: "historical_unavailable" as const,
    };
    const result = await new GetReaderSummaryWeeklyProjectionUseCase(
      new FakeWeeklyProjectionReader([dates[0]!], null, [limitation]),
    ).execute({ tenantId: tenant, workspaceId: workspace, weekStartedOn });

    expect(result).toMatchObject({
      ok: true,
      value: {
        activeWeeklyCertifiedArtifactPresent: false,
        evidenceLimitations: [limitation],
        artifact: null,
      },
    });
  });

  it("fails closed for contradictory artifact presence or limitations", async () => {
    const invalidPresence = new FakeWeeklyProjectionReader([], artifact);
    invalidPresence.activeWeeklyCertifiedArtifactPresent = false;
    await expect(new GetReaderSummaryWeeklyProjectionUseCase(
      invalidPresence,
    ).execute({ tenantId: tenant, workspaceId: workspace, weekStartedOn }))
      .resolves.toMatchObject({ ok: false });

    const invalidLimitation = {
      requestedUtcDate: dates[1]!,
      providerKey: "github-trending-page" as const,
      evidenceState: "historical_unavailable" as const,
    };
    await expect(new GetReaderSummaryWeeklyProjectionUseCase(
      new FakeWeeklyProjectionReader([dates[0]!], null, [invalidLimitation]),
    ).execute({ tenantId: tenant, workspaceId: workspace, weekStartedOn }))
      .resolves.toMatchObject({ ok: false });
  });
});

class FakeWeeklyProjectionReader
  implements ReaderSummaryWeeklyProjectionReaderPort
{
  readonly queries: Parameters<ReaderSummaryWeeklyProjectionReaderPort["read"]>[0][] = [];

  constructor(
    private readonly certifiedDailyEvidenceDates: readonly string[],
    private readonly artifact: PersistedReaderSummaryWeeklyArtifact | null,
    private readonly evidenceLimitations: readonly {
      requestedUtcDate: string;
      providerKey: "github-trending-page";
      evidenceState: "historical_unavailable";
    }[] = [],
  ) {
    this.activeWeeklyCertifiedArtifactPresent = artifact !== null;
  }

  activeWeeklyCertifiedArtifactPresent: boolean;

  async read(
    query: Parameters<ReaderSummaryWeeklyProjectionReaderPort["read"]>[0],
  ) {
    this.queries.push(query);
    return {
      certifiedDailyEvidenceDates: this.certifiedDailyEvidenceDates,
      activeWeeklyCertifiedArtifactPresent:
        this.activeWeeklyCertifiedArtifactPresent,
      evidenceLimitations: this.evidenceLimitations,
      artifact: this.artifact,
    };
  }
}
