import {
  githubTrendingDurableSnapshotProofPassesInvariants,
  InMemoryGitHubTrendingDurableSnapshotReader,
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotCandidate,
} from "./github-trending-durable-snapshot-reuse";

describe("GitHub Trending durable snapshot reuse", () => {
  it("reuses one valid exact Top 10 in canonical order with a derived proof", async () => {
    const rows = validRows().reverse();

    const proof = await reuse(rows);

    expect(proof.rows.map((row) => row.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(proof.proofSha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(githubTrendingDurableSnapshotProofPassesInvariants(proof)).toBe(
      true,
    );
    expect(JSON.stringify(proof)).not.toContain("Visible summary");
  });

  it("is deterministic and idempotent across replay time and input order", async () => {
    const rows = validRows();
    const first = await reuse(rows);
    const second = await reuse([...rows].reverse(), "2026-07-25T12:00:00.000Z");

    expect(second).toEqual(first);
  });

  it("selects the newest group before validation and never falls back", async () => {
    const older = validRows({
      scanJobId: "scan-older",
      fetchStartedAt: "2026-07-23T11:50:00.000Z",
      checkedAt: "2026-07-23T12:00:00.000Z",
      observedAt: "2026-07-23T12:00:01.000Z",
    });
    const partialNewest = validRows({
      scanJobId: "scan-newest",
      fetchStartedAt: "2026-07-23T23:50:00.000Z",
      checkedAt: "2026-07-23T23:59:00.000Z",
      observedAt: "2026-07-24T00:00:01.000Z",
    }).slice(0, 9);

    await expect(reuse([...older, ...partialNewest])).rejects.toThrow(
      "partial_group",
    );
  });

  it("rejects every day-touching candidate with malformed ordering identity before sorting", async () => {
    const older = validRows({
      scanJobId: "scan-older",
      fetchStartedAt: "2026-07-23T11:50:00.000Z",
      checkedAt: "2026-07-23T12:00:00.000Z",
      observedAt: "2026-07-23T12:00:01.000Z",
    });
    const malformedNewest = validRows({
      scanJobId: "scan-malformed-newest",
      fetchStartedAt: "2026-07-23T23:50:00.000",
      checkedAt: "2026-07-23T23:59:00.000",
      publishedAt: "2026-07-22T00:01:00.000Z",
      observedAt: "2026-07-23T23:59:01.000Z",
    });

    await expect(reuse([...older, ...malformedNewest])).rejects.toThrow(
      "invalid_ordering_identity",
    );
  });

  it.each<{
    readonly name: string;
    readonly field:
      | "sourcePublishedAt"
      | "feedFetchStartedAt"
      | "feedCheckedAt";
    readonly dayTouch: string;
  }>([
    {
      name: "only sourcePublishedAt",
      field: "sourcePublishedAt",
      dayTouch: "2026-07-23T23:58:00.000Z",
    },
    {
      name: "only feedFetchStartedAt",
      field: "feedFetchStartedAt",
      dayTouch: "2026-07-23T23:57:00.000Z",
    },
    {
      name: "only feedCheckedAt",
      field: "feedCheckedAt",
      dayTouch: "2026-07-23T23:59:00.000Z",
    },
  ])(
    "rejects a day-touching identity mismatch before an older fallback when $name touches the day",
    async ({ field, dayTouch }) => {
      const olderFallback = validRows({
        scanJobId: "scan-older-fallback",
        fetchStartedAt: "2026-07-23T11:50:00.000Z",
        checkedAt: "2026-07-23T12:00:00.000Z",
        observedAt: "2026-07-23T12:00:01.000Z",
      });
      const invalidDayTouching = validRows({
        scanJobId: `scan-${field}-mismatch`,
        fetchStartedAt: "2026-07-22T11:50:00.000Z",
        checkedAt: "2026-07-22T12:00:00.000Z",
        observedAt: "2026-07-22T12:00:01.000Z",
      }).map((row) => ({ ...row, [field]: dayTouch }));

      await expect(
        reuse([...olderFallback, ...invalidDayTouching]),
      ).rejects.toThrow("invalid_ordering_identity");
    },
  );

  it("does not reuse candidates whose source-item tenant or workspace differs", async () => {
    const mismatchedScope = validRows().map((row) => ({
      ...row,
      sourceTenantId: "tenant-other",
      sourceWorkspaceId: "workspace-other",
    }));

    await expect(reuse(mismatchedScope)).rejects.toThrow("snapshot_missing");
  });

  it.each<{ readonly name: string; readonly rows: Candidate[] }>([
    {
      name: "post-midnight timestamps backdated into the requested day",
      rows: validRows({
        fetchStartedAt: "2026-07-24T00:00:01.000Z",
        checkedAt: "2026-07-24T00:00:02.000Z",
        publishedAt: "2026-07-23T23:59:59.999Z",
        observedAt: "2026-07-24T00:00:03.000Z",
      }),
    },
    {
      name: "a fetch crossing midnight before publication",
      rows: validRows({
        fetchStartedAt: "2026-07-23T23:59:59.999Z",
        checkedAt: "2026-07-24T00:00:00.001Z",
        publishedAt: "2026-07-24T00:00:00.001Z",
        observedAt: "2026-07-24T00:00:01.000Z",
      }),
    },
  ])("rejects $name", async ({ rows }) => {
    await expect(reuse(rows)).rejects.toThrow("selected_group_invalid");
  });

  it("rejects a hybrid of scan identities sharing one time envelope", async () => {
    const rows = validRows().map((row, index) =>
      index === 9
        ? {
            ...row,
            scanJobId: "scan-hybrid",
            feedScanJobId: "scan-hybrid",
            providerItemId: row.providerItemId.replace(
              "scan-valid",
              "scan-hybrid",
            ),
          }
        : row,
    );

    await expect(reuse(rows)).rejects.toThrow("ambiguous_scan_identity");
  });

  it.each([
    ["missing rank", (rows: Candidate[]) => rows.slice(0, 9)],
    [
      "duplicate rank",
      (rows: Candidate[]) => rows.map((row, index) =>
        index === 9 ? { ...row, rank: 9 } : row,
      ),
    ],
    [
      "duplicate repository",
      (rows: Candidate[]) => rows.map((row, index) =>
        index === 9
          ? {
              ...row,
              repositoryFullName: rows[8]!.repositoryFullName,
              repositoryUrl: rows[8]!.repositoryUrl,
              canonicalUrl: rows[8]!.canonicalUrl,
              providerItemId: rows[8]!.providerItemId,
            }
          : row,
      ),
    ],
    [
      "duplicate feed identity",
      (rows: Candidate[]) => rows.map((row, index) =>
        index === 9 ? { ...row, feedItemId: rows[8]!.feedItemId } : row,
      ),
    ],
    [
      "duplicate source identity",
      (rows: Candidate[]) => rows.map((row, index) =>
        index === 9 ? { ...row, sourceItemId: rows[8]!.sourceItemId } : row,
      ),
    ],
    [
      "missing feed identity",
      (rows: Candidate[]) => rows.map((row, index) =>
        index === 9 ? { ...row, feedItemId: "" } : row,
      ),
    ],
    [
      "missing source identity",
      (rows: Candidate[]) => rows.map((row, index) =>
        index === 9 ? { ...row, sourceItemId: "" } : row,
      ),
    ],
  ])("rejects %s", async (_name, mutate) => {
    await expect(reuse(mutate(validRows()))).rejects.toThrow(
      /partial_group|duplicate_identity|selected_group_invalid/u,
    );
  });

  it("rejects an unsuccessful source scan", async () => {
    await expect(
      reuse(
        validRows().map((row) => ({
          ...row,
          scanJobStatus: "FAILED",
        })),
      ),
    ).rejects.toThrow("selected_group_invalid");
  });

  it("rejects mixed observedAt envelopes and future persistence times", async () => {
    const mixed = validRows().map((row, index) =>
      index === 9
        ? {
            ...row,
            feedObservedAt: "2026-07-24T00:00:02.000Z",
            sourceObservedAt: "2026-07-24T00:00:02.000Z",
          }
        : row,
    );
    await expect(reuse(mixed)).rejects.toThrow("ambiguous_scan_identity");
    await expect(
      reuse(
        validRows({
          observedAt: "2026-07-24T00:06:00.000Z",
        }),
      ),
    ).rejects.toThrow("selected_group_invalid");
  });

  it("rejects a malformed observedAt identity before group selection", async () => {
    const malformed = validRows().map((row) => ({
      ...row,
      feedObservedAt: "2026-07-24T00:00:01.000",
      sourceObservedAt: "2026-07-24T00:00:01.000",
    }));

    await expect(reuse(malformed)).rejects.toThrow(
      "invalid_ordering_identity",
    );
  });

  it("requires bounded visible text and preserves the board star threshold", async () => {
    await expect(
      reuse(
        validRows().map((row, index) =>
          index === 0
            ? {
                ...row,
                feedTitle: " ",
                sourceTitle: " ",
                feedTitleBytes: 1,
                sourceTitleBytes: 1,
              }
            : row,
        ),
      ),
    ).rejects.toThrow("selected_group_invalid");

    const proof = await reuse(
      validRows().map((row, index) => ({
        ...row,
        starsGained: index === 0 ? 1_000 : 1_001,
      })),
    );
    expect(proof.rows[0]?.highlightEligible).toBe(false);
    expect(proof.rows[1]?.highlightEligible).toBe(true);
  });

  it("rejects proof mutation instead of trusting a supplied hash or flag", async () => {
    const proof = await reuse(validRows());
    const tampered = {
      ...proof,
      rows: proof.rows.map((row, index) =>
        index === 0 ? { ...row, starsGained: row.starsGained + 1 } : row,
      ),
    };

    expect(githubTrendingDurableSnapshotProofPassesInvariants(tampered)).toBe(
      false,
    );
  });
});

type Candidate = GitHubTrendingDurableSnapshotCandidate;

const reuse = (
  rows: readonly Candidate[],
  observedThrough = "2026-07-24T00:05:00.000Z",
) =>
  reuseGitHubTrendingDurableSnapshot({
    reader: new InMemoryGitHubTrendingDurableSnapshotReader(rows),
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    sourceBindingId: "binding-a",
    requestedUtcDay: "2026-07-23",
    observedThrough: new Date(observedThrough),
  });

function validRows(overrides?: {
  readonly scanJobId?: string;
  readonly fetchStartedAt?: string;
  readonly checkedAt?: string;
  readonly publishedAt?: string;
  readonly observedAt?: string;
}): Candidate[] {
  const scanJobId = overrides?.scanJobId ?? "scan-valid";
  const fetchStartedAt =
    overrides?.fetchStartedAt ?? "2026-07-23T23:50:00.000Z";
  const checkedAt = overrides?.checkedAt ?? "2026-07-23T23:59:00.000Z";
  const publishedAt = overrides?.publishedAt ?? checkedAt;
  const observedAt =
    overrides?.observedAt ?? "2026-07-24T00:00:01.000Z";
  return Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    const repository = `owner/repository-${rank}`;
    const title = `${repository} is #${rank} on GitHub Trending`;
    const bodyPreview = `Visible summary for ${repository}.`;
    return {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      sourceTenantId: "tenant-a",
      sourceWorkspaceId: "workspace-a",
      feedItemId: `feed-${rank}`,
      sourceItemId: `source-${rank}`,
      feedSourceBindingId: "binding-a",
      sourceSourceBindingId: "binding-a",
      feedProviderKey: "github-trending-page",
      sourceProviderKey: "github-trending-page",
      feedStatus: "VISIBLE",
      providerItemId: `github-trending-page:daily:${scanJobId}:${repository}`,
      canonicalUrl: `https://github.com/${repository}`,
      metadataKind: "github_trending_page_repository",
      repositoryFullName: repository,
      repositoryUrl: `https://github.com/${repository}`,
      rank,
      starsGained: 1_001 + rank,
      totalStars: 10_000 + rank,
      window: "daily",
      scanJobId,
      feedScanJobId: scanJobId,
      fetchStartedAt,
      feedFetchStartedAt: fetchStartedAt,
      checkedAt,
      feedCheckedAt: checkedAt,
      publishedAt,
      sourcePublishedAt: publishedAt,
      feedObservedAt: observedAt,
      sourceObservedAt: observedAt,
      scanJobStatus: "SUCCEEDED",
      scanJobTenantId: "tenant-a",
      scanJobWorkspaceId: "workspace-a",
      scanJobSourceBindingId: "binding-a",
      sourceContentHash: "a".repeat(64),
      sourceProviderContentHash: "b".repeat(64),
      sourceTitle: title,
      feedTitle: title,
      bodyPreview,
      sourceTitleBytes: Buffer.byteLength(title, "utf8"),
      feedTitleBytes: Buffer.byteLength(title, "utf8"),
      bodyPreviewBytes: Buffer.byteLength(bodyPreview, "utf8"),
      feedSnapshotSourceBindingId: "binding-a",
      feedSnapshotProviderKey: "github-trending-page",
    };
  });
}
