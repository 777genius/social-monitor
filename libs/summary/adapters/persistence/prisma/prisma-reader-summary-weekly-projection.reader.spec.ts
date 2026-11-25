import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PersistedReaderSummaryWeeklyArtifact } from "../../../ports";
import { canonicalizeReaderSummaryWeeklyJson } from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
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
    mockAuthorities({ "2026-07-21": "historical_unavailable" });
    const artifact = weeklyArtifact(publicationIds, {
      "2026-07-21": "historical_unavailable",
    });
    const strictRead = jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    ).mockResolvedValue(artifact);
    const client = projectionClient(
      dates.map((date, index) => ({
        requestedUtcDate: date,
        publicationId: publicationIds[index]!,
        currentPublicationId: publicationIds[index]!,
        githubEvidence: githubEvidence(
          date.toISOString().slice(0, 10),
          index === 1 ? "historical_unavailable" : "ordinary_not_required",
        ),
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
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: [{
        requestedUtcDate: "2026-07-21",
        providerKey: "github-trending-page",
        evidenceState: "historical_unavailable",
      }],
      artifact,
    });
    expect(strictRead).toHaveBeenCalledWith(client, {
      tenantId: tenant,
      workspaceId: workspace,
      artifactId,
    });
  });

  it("ignores superseded unavailable evidence when the seal selects a newer verified publication", async () => {
    const publicationIds = dates.map((_, index) =>
      `00000000-0000-7000-8000-00000000072${index}`,
    );
    const revisedIndex = 1;
    const revisedDate = dates[revisedIndex]!;
    const revisedPublicationId = publicationIds[revisedIndex]!;
    const supersededPublicationId =
      "00000000-0000-7000-8000-000000000729";
    mockAuthorities({ "2026-07-21": "verified" });
    const artifact = weeklyArtifact(publicationIds, {
      "2026-07-21": "verified",
    });
    jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    ).mockResolvedValue(artifact);
    const currentRows = dates.map((date, index) => ({
      requestedUtcDate: date,
      publicationId: publicationIds[index]!,
      currentPublicationId: publicationIds[index]!,
      githubEvidence: githubEvidence(
        date.toISOString().slice(0, 10),
        index === revisedIndex ? "verified" : "ordinary_not_required",
      ),
    }));
    const rows = [
      ...currentRows.slice(0, revisedIndex),
      {
        requestedUtcDate: revisedDate,
        publicationId: supersededPublicationId,
        currentPublicationId: revisedPublicationId,
        githubEvidence: githubEvidence(
          revisedDate.toISOString().slice(0, 10),
          "historical_unavailable",
        ),
      },
      ...currentRows.slice(revisedIndex),
    ];

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(
      projectionClient(rows, [activeWeeklySlot()]),
    ).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).resolves.toMatchObject({
      certifiedDailyEvidenceDates: dates.map((date) =>
        date.toISOString().slice(0, 10),
      ),
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: [],
      artifact,
    });
  });

  it.each([
    ["missing", (rows: readonly DailyAuthorityRow[]) => rows.slice(0, 6)],
    ["duplicate", (rows: readonly DailyAuthorityRow[]) => [...rows, rows[0]!]],
    ["divergent", (rows: readonly DailyAuthorityRow[]) => rows.map((row, index) =>
      index === 0 ? { ...row, currentPublicationId: artifactId } : row)],
  ])("fails closed when current daily authorities are %s", async (_, mutate) => {
    const publicationIds = dates.map((__, index) =>
      `00000000-0000-7000-8000-00000000072${index}`,
    );
    mockAuthorities();
    jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    ).mockResolvedValue(weeklyArtifact(publicationIds));
    const rows = dates.map((date, index) => dailyAuthorityRow(
      date,
      publicationIds[index]!,
    ));

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(
      projectionClient(mutate(rows), [activeWeeklySlot()]),
    ).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).rejects.toThrow("sealed and current daily authorities diverged");
  });

  it.each([
    ["storyAuthorityIdentity", "wrong-story-authority"],
    ["storyAuthoritySha256", "1".repeat(64)],
    ["githubBoardIdentity", "wrong-github-board"],
    ["githubBoardSha256", "2".repeat(64)],
  ] as const)("rejects an active artifact with mismatched %s", async (
    field,
    value,
  ) => {
    mockAuthorities();
    const baseline = weeklyArtifact(currentPublicationIds);
    const artifact = {
      ...baseline,
      proof: {
        ...baseline.proof,
        authorities: baseline.proof.authorities.map((authority, index) =>
          index === 0 ? { ...authority, [field]: value } : authority),
      },
    } as PersistedReaderSummaryWeeklyArtifact;
    jest.spyOn(
      weeklyArtifactReader,
      "findReaderSummaryWeeklyArtifactById",
    ).mockResolvedValue(artifact);

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(
      projectionClient(
        dates.map((date, index) =>
          dailyAuthorityRow(date, currentPublicationIds[index]!)),
        [activeWeeklySlot()],
      ),
    ).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).rejects.toThrow("artifact authority diverged");
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
        activeWeeklyCertifiedArtifactPresent: false,
        evidenceLimitations: [],
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
      activeWeeklyCertifiedArtifactPresent: false,
      evidenceLimitations: [],
      artifact: null,
    });
    expect(strictRead).not.toHaveBeenCalled();
  });

  it("returns one current partial daily row without a weekly slot or seal and ignores its superseded row", async () => {
    const requestedUtcDate = dates[1]!;
    const requestedUtcDay = "2026-07-21";
    const currentPublicationId = currentPublicationIds[1]!;
    const supersededPublicationId =
      "00000000-0000-7000-8000-000000000729";
    mockAuthorities({ [requestedUtcDay]: "historical_unavailable" });
    const sealLoad = jest.spyOn(
      PrismaReaderSummaryWeeklyCertificationSealAuthority.prototype,
      "load",
    ).mockResolvedValue(null);
    const storyLoad = jest.spyOn(
      PrismaReaderSummaryWeeklyStoryAuthority.prototype,
      "load",
    );
    const rows = [{
      requestedUtcDate,
      publicationId: supersededPublicationId,
      currentPublicationId,
      githubEvidence: githubEvidence(requestedUtcDay, "verified"),
    }, {
      requestedUtcDate,
      publicationId: currentPublicationId,
      currentPublicationId,
      githubEvidence: githubEvidence(
        requestedUtcDay,
        "historical_unavailable",
      ),
    }];

    await expect(new PrismaReaderSummaryWeeklyProjectionReader(
      projectionClient(rows, []),
    ).read({
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn,
    })).resolves.toEqual({
      certifiedDailyEvidenceDates: [requestedUtcDay],
      activeWeeklyCertifiedArtifactPresent: false,
      evidenceLimitations: [{
        requestedUtcDate: requestedUtcDay,
        providerKey: "github-trending-page",
        evidenceState: "historical_unavailable",
      }],
      artifact: null,
    });
    expect(sealLoad).not.toHaveBeenCalled();
    expect(storyLoad).toHaveBeenCalledTimes(1);
    expect(storyLoad).toHaveBeenCalledWith(expect.objectContaining({
      publicationId: currentPublicationId,
    }));
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
      query.includes(`slot."cadence" = 'weekly'`),
    );
    const dailyEvidenceQuery = queries.find((query) =>
      query.includes('reader_summary_weekly_publication_evidence'),
    );
    expect(dailyEvidenceQuery).toMatch(
      /^\s*JOIN "reader_summary_publication_slots" AS daily_slot$/mu,
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."tenant_id" = evidence."tenant_id"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."workspace_id" = evidence."workspace_id"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."scope_type" = evidence."scope_type"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."scope_key" = evidence."scope_key"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."cadence" = evidence."cadence"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."period_started_at" = evidence."period_started_at"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."period_ended_at" = evidence."period_ended_at"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."period_timezone" = evidence."period_timezone"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_slot."current_publication_id" = evidence."publication_id"',
    );
    expect(dailyEvidenceQuery).toMatch(
      /^\s*JOIN "reader_summary_publications" AS daily_publication$/mu,
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."id" = daily_slot."current_publication_id"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."id" = evidence."publication_id"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."tenant_id" = evidence."tenant_id"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."workspace_id" = evidence."workspace_id"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."scope_type" = evidence."scope_type"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."scope_key" = evidence."scope_key"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."cadence" = evidence."cadence"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."period_started_at" = evidence."period_started_at"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."period_ended_at" = evidence."period_ended_at"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."period_timezone" = evidence."period_timezone"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."requested_utc_date" = evidence."requested_utc_date"',
    );
    expect(dailyEvidenceQuery).toContain(
      'daily_publication."semantic_status" = evidence."semantic_status"',
    );
    expect(dailyEvidenceQuery).toContain(
      `evidence."cadence" = 'daily'`,
    );
    expect(dailyEvidenceQuery).toContain(
      `daily_publication."publication_kind" = 'EXACT'`,
    );
    expect(dailyEvidenceQuery).toContain(
      `daily_publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')`,
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

const mockAuthorities = (
  modeByDate: Readonly<Record<string, GitHubEvidenceMode>> = {},
): void => {
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
    ...sealedDay(
      (handle as unknown as { date: string }).date,
      (handle as unknown as { publicationId: string }).publicationId,
    ),
    scope: { type: "workspace" },
    identity: storyAuthorityIdentity(
      (handle as unknown as { date: string }).date,
    ),
    sha256: storyAuthoritySha256(
      (handle as unknown as { date: string }).date,
    ),
    githubEvidenceSha256: githubEvidence(
      (handle as unknown as { date: string }).date,
      modeByDate[(handle as unknown as { date: string }).date] ??
        "ordinary_not_required",
    ).sha256,
  }) as never);
  jest.spyOn(
    PrismaReaderSummaryWeeklyCertificationSealAuthority.prototype,
    "load",
  ).mockResolvedValue({} as never);
  jest.spyOn(
    PrismaReaderSummaryWeeklyCertificationSealAuthority.prototype,
    "readVerifiedBinding",
  ).mockImplementation(() => ({
    sealId,
    sealSha,
    days: sealedDays(currentPublicationIds),
  }) as never);
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
    if (query.includes("weekly_publication_evidence")) return evidence;
    if (query.includes("weekly_certification_seals")) return [];
    return slots;
  },
}) as unknown as PrismaSummaryClient;

const weeklyArtifact = (
  publicationIds: readonly string[],
  modeByDate: Readonly<Record<string, GitHubEvidenceMode>> = {},
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
    authorities: publicationIds.map((publicationId, index) =>
      authorityProof(
        dates[index]!.toISOString().slice(0, 10),
        publicationId,
        modeByDate[dates[index]!.toISOString().slice(0, 10)] ??
          "ordinary_not_required",
      )),
  } as never,
});

type GitHubEvidenceMode =
  | "verified"
  | "ordinary_not_required"
  | "historical_unavailable";

const githubEvidence = (
  requestedUtcDay: string,
  mode: GitHubEvidenceMode,
) => {
  const historical = mode === "historical_unavailable";
  const verified = mode === "verified";
  const providerHash = "d".repeat(64);
  const repositories = verified
    ? Array.from({ length: 10 }, (_, index) => ({
        rank: index + 1,
        citationId: `citation-${requestedUtcDay}-${index}`,
        feedItemId: `feed-${requestedUtcDay}-${index}`,
        sourceItemId: `source-${requestedUtcDay}-${index}`,
        repositoryIdentity: `example/repo-${requestedUtcDay}-${index}`,
        canonicalUrl: `https://github.com/example/repo-${requestedUtcDay}-${index}`,
        sourceContentHash: `${index.toString(16)}`.repeat(64),
        sourceProviderContentHash: providerHash,
      }))
    : [];
  const body = {
    schemaVersion: "reader_summary.weekly_publication_github_evidence.v1",
    mode,
    requestedUtcDay,
    providerKey: "github-trending-page",
    scanJobId: verified ? `scan-${requestedUtcDay}` : null,
    sourceBindingId: verified ? `binding-${requestedUtcDay}` : null,
    evidenceCount: repositories.length,
    historicalUnavailableReason: historical
      ? "Historical GitHub projection was not captured."
      : null,
    authorizedAt: historical
      ? new Date(
          Date.parse(`${requestedUtcDay}T00:00:00.000Z`) + 86_400_000,
        ).toISOString()
      : null,
    sourceProviderContentHash: verified ? providerHash : null,
    repositories,
  } as const;
  return {
    ...body,
    sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
  };
};

const currentPublicationIds = dates.map((_, index) =>
  `00000000-0000-7000-8000-00000000072${index}`,
);

const sealedDays = (publicationIds: readonly string[]) =>
  publicationIds.map((publicationId, index) =>
    sealedDay(dates[index]!.toISOString().slice(0, 10), publicationId));

const sealedDay = (requestedUtcDate: string, publicationId: string) => ({
  requestedUtcDate,
  publicationId,
  artifactId: `daily-artifact-${requestedUtcDate}`,
  jobId: `daily-job-${requestedUtcDate}`,
  semanticStatus: "COMPLETED" as const,
  publicationEvidenceIdentity:
    `reader_summary.weekly_publication_evidence.v1:${"b".repeat(64)}`,
  publicationEvidenceSha256: "b".repeat(64),
});

const authorityProof = (
  requestedUtcDate: string,
  publicationId: string,
  mode: GitHubEvidenceMode,
) => ({
  requestedUtcDate,
  publicationId,
  publicationEvidenceIdentity:
    `reader_summary.weekly_publication_evidence.v1:${"b".repeat(64)}`,
  publicationEvidenceSha256: "b".repeat(64),
  storyAuthorityIdentity: storyAuthorityIdentity(requestedUtcDate),
  storyAuthoritySha256: storyAuthoritySha256(requestedUtcDate),
  githubBoardIdentity:
    `reader_summary.weekly_publication_github_evidence.v1:${githubEvidence(requestedUtcDate, mode).sha256}`,
  githubBoardSha256: githubEvidence(requestedUtcDate, mode).sha256,
});

const storyAuthorityIdentity = (requestedUtcDate: string): string =>
  `reader_summary.weekly_story_authority.v1:${storyAuthoritySha256(requestedUtcDate)}`;

const storyAuthoritySha256 = (requestedUtcDate: string): string =>
  canonicalizeReaderSummaryWeeklyJson({ requestedUtcDate }).sha256;

type DailyAuthorityRow = ReturnType<typeof dailyAuthorityRow>;

const dailyAuthorityRow = (requestedUtcDate: Date, publicationId: string) => ({
  requestedUtcDate,
  publicationId,
  currentPublicationId: publicationId,
  githubEvidence: githubEvidence(
    requestedUtcDate.toISOString().slice(0, 10),
    "ordinary_not_required",
  ),
});

const activeWeeklySlot = () => ({
  currentPublicationId: artifactId,
  publicationId: artifactId,
  publicationKind: "WEEKLY_CERTIFIED",
  artifactId,
});
