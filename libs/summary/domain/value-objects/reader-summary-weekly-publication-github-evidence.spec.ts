import {
  githubTrendingArchiveExternalId,
  type GitHubTrendingArchiveMetadata,
} from "@social-monitor/ingestion/domain";
import { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { ReaderSummaryGitHubProjectionItem } from "../policies/reader-summary-github-projection-audit";
import { evaluateReaderSummaryGitHubProjection } from "../policies/reader-summary-github-projection-policy";
import {
  githubBoardArtifact,
  githubProjectionInput,
} from "../policies/reader-summary-github-projection-policy.spec-support";
import { canonicalizeReaderSummaryWeeklyJson } from "./reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
  deriveReaderSummaryWeeklyPublicationGitHubEvidence,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "./reader-summary-weekly-publication-github-evidence";

const day = "2026-07-10";
const acquiredAt = "2026-10-13T00:00:00.000Z";
const persistedAt = "2026-10-13T00:05:00.000Z";

const items = (): readonly ReaderSummaryGitHubProjectionItem[] =>
  githubProjectionInput().map((item, index) => {
    const observation: GitHubTrendingArchiveMetadata = {
      kind: "github_trending_page_repository",
      repository: {
        fullName: item.repositoryFullName!,
        url: item.canonicalUrl,
        totalStars: 10000,
        forksCount: 100,
      },
      trending: {
        observationKind: "archived",
        window: "daily",
        source: "github_trending_archive",
        rank: index + 1,
        originalArchiveRank: index + 2,
        starsGained: item.starsGained!,
        snapshotContentHash: "c".repeat(64),
        scanJobId: null,
        fetchStartedAt: null,
        checkedAt: null,
      },
      archive: {
        repository: "example/trending-archive",
        commit: "a".repeat(40),
        gitBlobSha1: "b".repeat(40),
        filePath: "api/daily/all.json",
        fileSha256: "d".repeat(64),
        originalSourceUrl: "https://github.com/trending?since=daily",
        serializedAt: `${day}T12:00:00.000Z`,
        committedAt: `${day}T12:01:00.000Z`,
        acquiredAt,
      },
    };
    return {
      ...item,
      observationKind: "archived",
      archivedObservation: observation,
      sourceExternalId: githubTrendingArchiveExternalId(
        observation.archive,
        observation.repository.fullName,
      ),
      scanJobId: undefined,
      fetchStartedAt: undefined,
      checkedAt: undefined,
      publishedAt: new Date(observation.archive.serializedAt),
      observedAt: new Date(persistedAt),
    };
  });

const artifact = (count = 10): ReaderSummaryArtifact => {
  const snapshot = githubBoardArtifact({ selectedPostCount: count }).toSnapshot();
  return ReaderSummaryArtifact.create({
    ...snapshot,
    content: {
      ...snapshot.content!,
      selectedPosts: snapshot.content!.selectedPosts!.map((post, index) => ({
        ...post,
        providerMetrics: [
          {
            label: `GitHub Trending archive ${day}`,
            value: `#${index + 1}, +${101 + index} stars on ${day}`,
          },
        ],
      })),
    },
  });
};

const derivedEvidence = (
  count = 10,
): ReaderSummaryWeeklyPublicationGitHubEvidence => {
  const selected = artifact(count);
  const evaluation = evaluateReaderSummaryGitHubProjection({
    artifact: selected,
    items: items().slice(0, count),
    eligibleBindingIds: ["github-binding-a"],
    pageCount: 2,
    observedThrough: new Date("2026-10-13T01:00:00.000Z"),
  });
  return deriveReaderSummaryWeeklyPublicationGitHubEvidence({
    artifact: selected,
    audit: evaluation.audit,
  });
};

const resealed = (
  overrides: Partial<
    Omit<ReaderSummaryWeeklyPublicationGitHubEvidence, "sha256">
  >,
): unknown => {
  const { sha256: _sha256, ...body } = { ...derivedEvidence(), ...overrides };
  return { ...body, sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256 };
};

describe("archived GitHub publication evidence", () => {
  it("seals archived GitHub evidence that the persisted assert accepts", () => {
    const evidence = derivedEvidence();
    expect(evidence.mode).toBe("archived_verified");
    expect(evidence.scanJobId).toBeNull();
    expect(evidence.sourceBindingId).toBe("github-binding-a");
    expect(evidence.evidenceCount).toBe(10);
    expect(evidence.repositories.map((repository) => repository.rank)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1),
    );
    expect(
      new Set(
        evidence.repositories.map(
          (repository) => repository.sourceProviderContentHash,
        ),
      ),
    ).toEqual(new Set([evidence.sourceProviderContentHash]));
    expect(() =>
      assertReaderSummaryWeeklyPublicationGitHubEvidence(evidence),
    ).not.toThrow();
  });

  it("seals a complete archived board with fewer than 10 rows", () => {
    const evidence = derivedEvidence(9);
    expect(evidence.mode).toBe("archived_verified");
    expect(evidence.evidenceCount).toBe(9);
    expect(evidence.repositories.map((repository) => repository.rank)).toEqual(
      Array.from({ length: 9 }, (_, index) => index + 1),
    );
    expect(() =>
      assertReaderSummaryWeeklyPublicationGitHubEvidence(evidence),
    ).not.toThrow();
  });

  it("rejects a forged archived GitHub evidence seal", () => {
    expect(() =>
      assertReaderSummaryWeeklyPublicationGitHubEvidence({
        ...derivedEvidence(),
        sha256: "0".repeat(64),
      }),
    ).toThrow(/seal is invalid/u);
  });

  it("rejects archived evidence that claims live scan custody", () => {
    expect(() =>
      assertReaderSummaryWeeklyPublicationGitHubEvidence(
        resealed({ scanJobId: "invented-scan" }),
      ),
    ).toThrow(/mode is invalid/u);
    expect(() =>
      assertReaderSummaryWeeklyPublicationGitHubEvidence(
        resealed({ mode: "verified" }),
      ),
    ).toThrow(/mode is invalid/u);
  });
});
