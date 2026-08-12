import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PersistedReaderSummaryWeeklyArtifact } from "../../../ports";
import * as weeklyArtifactReader from "./prisma-reader-summary-weekly-artifact";
import { PrismaReaderSummaryWeeklyCertificationSealAuthority } from "./prisma-reader-summary-weekly-certification-seal-authority";
import { PrismaReaderSummaryWeeklyProjectionReader } from "./prisma-reader-summary-weekly-projection.reader";
import { PrismaReaderSummaryWeeklyStoryAuthority } from "./prisma-reader-summary-weekly-story-authority";
import type { PrismaSummaryClient } from "./prisma-summary-client";

const tenant = tenantId("00000000-0000-7000-8000-000000000711");
const workspace = workspaceId("00000000-0000-7000-8000-000000000712");
const weekStartedOn = "2026-07-20";
const weekEndedOn = "2026-07-26";
const dates = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.parse(`${weekStartedOn}T00:00:00.000Z`) + index * 86_400_000),
);
const sealId = `reader_summary.weekly_certification_seal.v1:${"a".repeat(64)}`;
const sealSha = "a".repeat(64);
const artifactId = "00000000-0000-7000-8000-000000000719";

describe("PrismaReaderSummaryWeeklyProjectionReader", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns exact distinct verified dates and the strict active artifact", async () => {
    const publicationIds = dates.map((_, index) =>
      `00000000-0000-7000-8000-00000000072${index}`,
    );
    mockAuthorities();
    const artifact = weeklyArtifact(publicationIds);
    const strictRead = jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    ).mockResolvedValue(artifact);
    const client = projectionClient(
      dates.map((date, index) => ({
        requestedUtcDate: date,
        publicationId: publicationIds[index]!,
      })),
      [{
        currentPublicationId: artifactId,
        publicationId: artifactId,
        publicationKind: "WEEKLY_CERTIFIED",
        artifactId,
      }],
    );

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(client).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).resolves.toEqual({
      certifiedDailyEvidenceDates: dates.map((date) =>
        date.toISOString().slice(0, 10),
      ),
      artifact,
    });
    expect(strictRead).toHaveBeenCalledWith(client, {
      tenantId: tenant,
      workspaceId: workspace,
      artifactId,
    });
  });

  it("treats absence and a non-certified active publication as no artifact", async () => {
    const strictRead = jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    );
    for (const slots of [
      [],
      [{
        currentPublicationId: artifactId,
        publicationId: artifactId,
        publicationKind: "EXACT",
        artifactId,
      }],
    ]) {
      await expect(new PrismaReaderSummaryWeeklyProjectionReader(
        projectionClient([], slots),
      ).read({
        tenantId: tenant,
        workspaceId: workspace,
        weekStartedOn,
        weekEndedOn,
      })).resolves.toEqual({
        certifiedDailyEvidenceDates: [],
        artifact: null,
      });
    }
    expect(strictRead).not.toHaveBeenCalled();
  });

  it("treats a valid empty weekly publication slot as no artifact", async () => {
    const strictRead = jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    );

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(
      projectionClient([], [{
        currentPublicationId: null,
        publicationId: null,
        publicationKind: null,
        artifactId: null,
      }]),
    ).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).resolves.toEqual({
      certifiedDailyEvidenceDates: [],
      artifact: null,
    });
    expect(strictRead).not.toHaveBeenCalled();
  });

  it("uses UTC timestamp bounds for a Los Angeles database session", async () => {
    const queries: string[] = [];

    await new PrismaReaderSummaryWeeklyProjectionReader(
      projectionClient([], [], queries),
    ).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    });

    const slotQuery = queries.find((query) =>
      query.includes('reader_summary_publication_slots'),
    );
    expect(slotQuery).toMatch(
      /slot\."period_started_at"\s*=\s*\(\s*\$3::DATE::TIMESTAMP AT TIME ZONE 'UTC'\s*\)/u,
    );
    expect(slotQuery).toMatch(
      /slot\."period_ended_at"\s*=\s*\(\s*\(\(\$4::DATE \+ 1\)::TIMESTAMP AT TIME ZONE 'UTC'\)\s*\)/u,
    );
  });

  it("propagates strict artifact and database integrity failures", async () => {
    const failure = new Error("strict weekly artifact invalid");
    jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    ).mockRejectedValue(failure);
    const client = projectionClient([], [{
      currentPublicationId: artifactId,
      publicationId: artifactId,
      publicationKind: "WEEKLY_CERTIFIED",
      artifactId,
    }]);

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(client).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).rejects.toBe(failure);

    const databaseFailure = new Error("database unavailable");
    const failedClient = {
      $queryRaw: async () => Promise.reject(databaseFailure),
    } as unknown as PrismaSummaryClient;
    await expect(new PrismaReaderSummaryWeeklyProjectionReader(failedClient).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).rejects.toBe(databaseFailure);
  });
});

const mockAuthorities = (): void => {
  jest.spyOn(PrismaReaderSummaryWeeklyStoryAuthority.prototype, "load")
    .mockImplementation(async (query) => ({
      date: dates[Number(query.publicationId.slice(-1))]!
        .toISOString().slice(0, 10),
      publicationId: query.publicationId,
    }) as never);
  jest.spyOn(
    PrismaReaderSummaryWeeklyStoryAuthority.prototype,
    "readVerifiedBinding",
  ).mockImplementation((handle) => ({
    requestedUtcDate: (handle as unknown as { date: string }).date,
    publicationId: (handle as unknown as { publicationId: string }).publicationId,
    scope: { type: "workspace" },
  }) as never);
  jest.spyOn(
    PrismaReaderSummaryWeeklyCertificationSealAuthority.prototype,
    "load",
  ).mockResolvedValue({} as never);
  jest.spyOn(
    PrismaReaderSummaryWeeklyCertificationSealAuthority.prototype,
    "readVerifiedBinding",
  ).mockReturnValue({ sealId, sealSha } as never);
};

const projectionClient = (
  evidence: readonly unknown[],
  slots: readonly unknown[],
  queries?: string[],
): PrismaSummaryClient => ({
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce(
      (sql, part, index) =>
        `${sql}${part}${index < values.length ? `$${index + 1}` : ""}`,
      "",
    );
    queries?.push(query);
    return query.includes("weekly_publication_evidence")
      ? evidence
      : slots;
  },
}) as unknown as PrismaSummaryClient;

const weeklyArtifact = (
  publicationIds: readonly string[],
): PersistedReaderSummaryWeeklyArtifact => ({
  kind: "weekly",
  artifactId,
  tenantId: tenant,
  workspaceId: workspace,
  artifact: {} as never,
  qualitySignals: {} as never,
  proof: {
    weekStartedOn,
    weekEndedOn,
    manifestSealId: sealId,
    manifestSealSha256: sealSha,
    authorities: publicationIds.map((publicationId, index) => ({
      requestedUtcDate: dates[index]!.toISOString().slice(0, 10),
      publicationId,
    })),
  } as never,
});
