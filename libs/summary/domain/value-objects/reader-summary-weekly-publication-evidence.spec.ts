import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
} from "./reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyCanonicalPublicationEvidence,
  deriveReaderSummaryWeeklyPublicationEvidence,
  readerSummaryWeeklyPublicationEvidenceSchemaVersion,
  type ReaderSummaryWeeklyPublicationEvidenceAuthority,
} from "./reader-summary-weekly-publication-evidence";
import {
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "./reader-summary-weekly-publication-github-evidence";

describe("reader summary weekly publication evidence", () => {
  it.each(["COMPLETED", "NO_SIGNAL"] as const)(
    "seals DB authority for a real daily %s publication",
    (semanticStatus) => {
      const evidence = deriveReaderSummaryWeeklyPublicationEvidence(
        authority(semanticStatus),
      );

      expect(evidence.schemaVersion).toBe(
        readerSummaryWeeklyPublicationEvidenceSchemaVersion,
      );
      expect(evidence.semanticStatus).toBe(semanticStatus);
      expect(evidence.providerCounts).toEqual([
        { providerKey: "github-trending-page", count: 0 },
        { providerKey: "hacker-news", count: 0 },
        { providerKey: "reddit", count: 0 },
        { providerKey: "rss", count: semanticStatus === "COMPLETED" ? 1 : 0 },
        { providerKey: "x-twitter", count: 0 },
      ]);
      expect(evidence.providerEvidence).toHaveLength(
        semanticStatus === "COMPLETED" ? 1 : 0,
      );
      expect(evidence.githubEvidence.mode).toBe(
        semanticStatus === "COMPLETED"
          ? "historical_unavailable"
          : "ordinary_not_required",
      );
      expect(evidence.sha256).toBe(
        canonicalizeReaderSummaryWeeklyJson(
          JSON.parse(evidence.canonicalJson),
        ).sha256,
      );
      expect(evidence.identity).toBe(
        `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${evidence.sha256}`,
      );
    },
  );

  it("rejects non-daily, fake NO_SIGNAL and caller-authored authority", () => {
    const nonDaily = authority("COMPLETED");
    nonDaily.period = {
      ...nonDaily.period,
      cadence: "weekly",
    } as never;
    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(nonDaily),
    ).toThrow("period does not bind");

    const fakeNoSignal = authority("NO_SIGNAL");
    fakeNoSignal.artifactPayload = { qualityFlags: [] };
    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(fakeNoSignal),
    ).toThrow("not real");

    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence({
        ...authority("COMPLETED"),
        status: "verified",
      } as never),
    ).toThrow('derived field "status"');
  });

  it("binds historical omission to zero GitHub evidence and its exact reason", () => {
    const input = authority("COMPLETED");
    input.providerEvidence = [
      ...input.providerEvidence,
      providerEvidenceItem({
        citationId: "github-citation",
        feedItemId: "github-feed",
        sourceItemId: "github-source",
        sourceBindingId: "github-binding",
        providerKey: "github-trending-page",
        providerItemId: "owner/repository",
        canonicalUrl: "https://github.com/example/repository",
        sourceContentHash: "b".repeat(64),
      }),
    ];

    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(input),
    ).toThrow("GitHub provider evidence");
    expect(input.githubEvidence.historicalUnavailableReason).toBe(
      "Authorized source snapshot is unavailable for this historical day.",
    );
  });

  it("seals a verified exact GitHub board and rejects ordinary mode for COMPLETED", () => {
    const verified = authority("COMPLETED");
    verified.githubEvidence = verifiedGitHubEvidence();
    verified.providerEvidence = verified.githubEvidence.repositories.map(
      (repository) => providerEvidenceItem({
        citationId: repository.citationId,
        feedItemId: repository.feedItemId,
        sourceItemId: repository.sourceItemId,
        sourceBindingId: "github-binding",
        providerKey: "github-trending-page" as const,
        providerItemId: repository.repositoryIdentity,
        canonicalUrl: repository.canonicalUrl,
        sourceContentHash: repository.sourceContentHash,
      }),
    );
    const evidence =
      deriveReaderSummaryWeeklyPublicationEvidence(verified);
    expect(evidence.githubEvidence.mode).toBe("verified");
    expect(evidence.githubEvidence.repositories).toHaveLength(10);
    expect(evidence.providerEvidence).toHaveLength(10);

    const forgedState = authority("COMPLETED");
    forgedState.githubEvidence = ordinaryGitHubEvidence();
    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(forgedState),
    ).toThrow("ordinary GitHub mode requires a NO_SIGNAL publication");
  });

  it("rejects every NO_SIGNAL provider citation and verified GitHub board", () => {
    const providerCitation = authority("NO_SIGNAL");
    providerCitation.providerEvidence = [
      providerEvidenceItem({
        citationId: "rss-citation",
        feedItemId: "rss-feed",
        sourceItemId: "rss-source",
        sourceBindingId: "rss-binding",
        providerKey: "rss",
        providerItemId: "rss-provider-item",
        canonicalUrl: "https://example.test/story",
        sourceContentHash: "a".repeat(64),
      }),
    ];
    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(providerCitation),
    ).toThrow("NO_SIGNAL publication requires empty provider citations");

    const githubBoard = authority("NO_SIGNAL");
    githubBoard.githubEvidence = verifiedGitHubEvidence();
    githubBoard.providerEvidence = githubBoard.githubEvidence.repositories.map(
      (repository) => providerEvidenceItem({
        citationId: repository.citationId,
        feedItemId: repository.feedItemId,
        sourceItemId: repository.sourceItemId,
        sourceBindingId: "github-binding",
        providerKey: "github-trending-page" as const,
        providerItemId: repository.repositoryIdentity,
        canonicalUrl: repository.canonicalUrl,
        sourceContentHash: repository.sourceContentHash,
      }),
    );
    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(githubBoard),
    ).toThrow("NO_SIGNAL publication requires empty provider citations");
  });

  it("rejects COMPLETED without provider evidence and forged persisted counts", () => {
    const completed = authority("COMPLETED");
    completed.providerEvidence = [];
    expect(() =>
      deriveReaderSummaryWeeklyPublicationEvidence(completed),
    ).toThrow("COMPLETED publication requires provider evidence");

    const evidence = deriveReaderSummaryWeeklyPublicationEvidence(
      authority("NO_SIGNAL"),
    );
    const forgedBody = {
      ...JSON.parse(evidence.canonicalJson),
      providerCounts: evidence.providerCounts.map((providerCount) =>
        providerCount.providerKey === "rss"
          ? { ...providerCount, count: 1 }
          : providerCount,
      ),
    };
    const forgedCanonical =
      canonicalizeReaderSummaryWeeklyJson(forgedBody);
    const forged = {
      ...evidence,
      ...forgedBody,
      identity:
        `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:` +
        forgedCanonical.sha256,
      sha256: forgedCanonical.sha256,
      canonicalJson: forgedCanonical.json,
      byteLength: forgedCanonical.byteLength,
      toBytes: (): Uint8Array => forgedCanonical.toBytes(),
    };
    expect(() =>
      assertReaderSummaryWeeklyCanonicalPublicationEvidence(forged),
    ).toThrow("provider counts are not canonical");
  });
});

const authority = (
  semanticStatus: "COMPLETED" | "NO_SIGNAL",
): MutableAuthority => {
  const period = readerSummaryWeeklyDailyPeriod("2026-07-05");
  const publicationId = "20000000-0000-4000-8000-000000000001";
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    scope: { type: "workspace" },
    period,
    requestedUtcDate: "2026-07-05",
    publicationId,
    artifactId: publicationId,
    jobId: "10000000-0000-4000-8000-000000000001",
    semanticStatus,
    report: { body: "publication report", number: 1e-7 },
    exactProof: { proof: "DB-derived" },
    artifactPayload:
      semanticStatus === "NO_SIGNAL"
        ? {
            qualityFlags: ["no_signal"],
            noSignalReason: "No eligible evidence.",
          }
        : { qualityFlags: [] },
    providerEvidence:
      semanticStatus === "COMPLETED"
        ? [
            providerEvidenceItem({
              citationId: "rss-citation",
              feedItemId: "rss-feed",
              sourceItemId: "rss-source",
              sourceBindingId: "rss-binding",
              providerKey: "rss",
              providerItemId: "rss-provider-item",
              canonicalUrl: "https://example.test/story",
              sourceContentHash: "a".repeat(64),
            }),
          ]
        : [],
    githubEvidence:
      semanticStatus === "NO_SIGNAL"
        ? ordinaryGitHubEvidence()
        : historicalGitHubEvidence(),
    publishedAt: "2026-07-05T12:00:00.000Z",
  };
};

type MutableAuthority = {
  -readonly [TKey in keyof ReaderSummaryWeeklyPublicationEvidenceAuthority]:
    ReaderSummaryWeeklyPublicationEvidenceAuthority[TKey];
};

const providerEvidenceItem = (
  overrides: Pick<
    ReaderSummaryWeeklyPublicationEvidenceAuthority["providerEvidence"][number],
    | "citationId"
    | "feedItemId"
    | "sourceItemId"
    | "sourceBindingId"
    | "providerKey"
    | "providerItemId"
    | "canonicalUrl"
    | "sourceContentHash"
  >,
): ReaderSummaryWeeklyPublicationEvidenceAuthority["providerEvidence"][number] => ({
  citationField: "canonicalUrl",
  title: "Database-owned title",
  sourceText: "Database-owned source preview.",
  publishedAt: "2026-07-05T08:00:00.000Z",
  observedAt: "2026-07-05T08:05:00.000Z",
  ...overrides,
});

const historicalGitHubEvidence =
  (): ReaderSummaryWeeklyPublicationGitHubEvidence => {
    const body = {
      schemaVersion:
        readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
      mode: "historical_unavailable" as const,
      requestedUtcDay: "2026-07-05",
      providerKey: "github-trending-page" as const,
      scanJobId: null,
      sourceBindingId: null,
      evidenceCount: 0,
      historicalUnavailableReason:
        "Authorized source snapshot is unavailable for this historical day.",
      authorizedAt: "2026-07-06T00:00:00.000Z",
      sourceProviderContentHash: null,
      repositories: [],
    };
    return {
      ...body,
      sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
    };
  };

const ordinaryGitHubEvidence =
  (): ReaderSummaryWeeklyPublicationGitHubEvidence => {
    const body = {
      schemaVersion:
        readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
      mode: "ordinary_not_required" as const,
      requestedUtcDay: "2026-07-05",
      providerKey: "github-trending-page" as const,
      scanJobId: null,
      sourceBindingId: null,
      evidenceCount: 0,
      historicalUnavailableReason: null,
      authorizedAt: null,
      sourceProviderContentHash: null,
      repositories: [],
    };
    return {
      ...body,
      sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
    };
  };

const verifiedGitHubEvidence =
  (): ReaderSummaryWeeklyPublicationGitHubEvidence => {
    const repositories = Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      citationId: `github-citation-${index + 1}`,
      feedItemId: `github-feed-${index + 1}`,
      sourceItemId: `github-source-${index + 1}`,
      repositoryIdentity: `owner/repository-${index + 1}`,
      canonicalUrl: `https://github.com/owner/repository-${index + 1}`,
      sourceContentHash: "b".repeat(64),
      sourceProviderContentHash: "c".repeat(64),
    }));
    const body = {
      schemaVersion:
        readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
      mode: "verified" as const,
      requestedUtcDay: "2026-07-05",
      providerKey: "github-trending-page" as const,
      scanJobId: "github-scan",
      sourceBindingId: "github-binding",
      evidenceCount: repositories.length,
      historicalUnavailableReason: null,
      authorizedAt: null,
      sourceProviderContentHash: "c".repeat(64),
      repositories,
    };
    return {
      ...body,
      sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
    };
  };
