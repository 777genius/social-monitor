import { githubTrendingArchiveExternalId, type GitHubTrendingArchiveMetadata } from "@social-monitor/ingestion/domain";
import { evaluateReaderSummaryGitHubProjection, readerSummaryHasVerifiedGitHubProjection } from "./reader-summary-github-projection-policy";
import { githubBoardArtifact, githubProjectionInput } from "./reader-summary-github-projection-policy.spec-support";
import type { ReaderSummaryGitHubProjectionItem } from "./reader-summary-github-projection-audit";
import { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import { buildGitHubTrendingNarrativeAppendix, selectGitHubTrendingDisplayRepositories } from "./reader-summary-github-trending-policy";
import { buildReaderSummarySupplementalTrendSelectedPosts } from "../services/reader-summary-supplemental-selected-posts";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

const day = "2026-07-10";
const acquiredAt = "2026-10-13T00:00:00.000Z";
const persistedAt = "2026-10-13T00:05:00.000Z";
const cutoff = new Date("2026-10-13T01:00:00.000Z");
const items = (): readonly ReaderSummaryGitHubProjectionItem[] => githubProjectionInput().map((item, index) => {
  const observation: GitHubTrendingArchiveMetadata = {
    kind: "github_trending_page_repository",
    repository: { fullName: item.repositoryFullName!, url: item.canonicalUrl, totalStars: 10000, forksCount: 100 },
    trending: { observationKind: "archived", window: "daily", source: "github_trending_archive",
      rank: index + 1, originalArchiveRank: index + 2, starsGained: item.starsGained!,
      snapshotContentHash: "c".repeat(64), scanJobId: null, fetchStartedAt: null, checkedAt: null },
    archive: { repository: "example/trending-archive", commit: "a".repeat(40), gitBlobSha1: "b".repeat(40),
      filePath: "api/daily/all.json", fileSha256: "d".repeat(64),
      originalSourceUrl: "https://github.com/trending?since=daily",
      serializedAt: `${day}T12:00:00.000Z`, committedAt: `${day}T12:01:00.000Z`, acquiredAt },
  };
  return { ...item, observationKind: "archived", archivedObservation: observation,
    sourceExternalId: githubTrendingArchiveExternalId(observation.archive, observation.repository.fullName),
    scanJobId: undefined, fetchStartedAt: undefined, checkedAt: undefined,
    publishedAt: new Date(observation.archive.serializedAt), observedAt: new Date(persistedAt) };
});
const artifact = (count = 10): ReaderSummaryArtifact => {
  const snapshot = githubBoardArtifact({ selectedPostCount: count }).toSnapshot();
  return ReaderSummaryArtifact.create({ ...snapshot, content: { ...snapshot.content!,
    selectedPosts: snapshot.content!.selectedPosts!.map((post, index) => ({ ...post,
      providerMetrics: [{ label: `GitHub Trending archive ${day}`, value: `#${index + 1}, +${101 + index} stars on ${day}` }] })) } });
};
const evaluate = (rows = items(), selected = artifact(), observedThrough = cutoff) => evaluateReaderSummaryGitHubProjection({
  artifact: selected, items: rows, eligibleBindingIds: ["github-binding-a"], pageCount: 2, observedThrough,
});

describe("archived GitHub publication custody", () => {
  it("verifies original-day Top 10 with current truthful acquisition and no fabricated live timestamps", () => {
    const result = evaluate();
    expect(result.findings).toEqual([]);
    expect(result.audit.status).toBe("verified");
    expect(result.audit.bindings).toEqual([]);
    expect(result.audit.telemetry).toBeUndefined();
    expect(result.audit.projectionCheckedAt).toBeUndefined();
    expect(result.audit.archivedProjection?.bindings[0]).toMatchObject({
      scanJobId: null, fetchStartedAt: null, checkedAt: null, observedAt: persistedAt,
    });
    expect(readerSummaryHasVerifiedGitHubProjection({ artifact: artifact(), audit: result.audit })).toBe(true);
  });
  it("verifies a complete board as archived when the immutable archive published fewer than 10 rows", () => {
    const rows = items().slice(0, 9);
    const selected = artifact(9);
    const result = evaluate(rows, selected);
    expect(result.findings).toEqual([]);
    expect(result.audit.status).toBe("verified");
    expect(result.audit.archivedProjection?.bindings).toHaveLength(9);
    expect(readerSummaryHasVerifiedGitHubProjection({ artifact: selected, audit: result.audit })).toBe(true);
  });
  it("rejects an archived board whose ranks are not the complete contiguous archive", () => {
    const rows = items().slice(0, 9).map((item, index) => index === 8 ? { ...item,
      archivedObservation: { ...item.archivedObservation!, trending: { ...item.archivedObservation!.trending, rank: 10 } } } : item);
    expect(evaluate(rows, artifact(9)).audit.status).toBe("rejected");
  });
  it("rejects a board whose size does not match its archived rows", () => {
    expect(evaluate(items().slice(0, 9), artifact()).audit.status).toBe("rejected");
    expect(evaluate(items(), artifact(9)).audit.status).toBe("rejected");
  });
  it.each([
    ["fabricated fetch", (item: ReaderSummaryGitHubProjectionItem) => ({ ...item, fetchStartedAt: new Date(`${day}T11:59:00.000Z`) })],
    ["fabricated scan", (item: ReaderSummaryGitHubProjectionItem) => ({ ...item, scanJobId: "invented-scan" })],
    ["wrong day", (item: ReaderSummaryGitHubProjectionItem) => ({ ...item, publishedAt: new Date("2026-07-09T12:00:00.000Z") })],
    ["false acquisition", (item: ReaderSummaryGitHubProjectionItem) => ({ ...item, observedAt: new Date(`${day}T12:05:00.000Z`) })],
    ["wrong native id", (item: ReaderSummaryGitHubProjectionItem) => ({ ...item, sourceExternalId: "wrong" })],
    ["missing archive provenance", (item: ReaderSummaryGitHubProjectionItem) => ({ ...item, archivedObservation: undefined })],
    ["mixed live row", (item: ReaderSummaryGitHubProjectionItem) => ({ ...githubProjectionInput()[0]!, feedItemId: item.feedItemId })],
  ] as const)("rejects %s", (_name, mutate) => {
    expect(evaluate(items().map((item, index) => index === 0 ? mutate(item) : item)).audit.status).toBe("rejected");
  });
  it("rejects a cutoff before archive acquisition and legacy today labels", () => {
    expect(evaluate(items(), artifact(), new Date(`${day}T23:00:00.000Z`)).audit.status).toBe("rejected");
    expect(evaluate(items(), githubBoardArtifact()).audit.status).toBe("rejected");
  });
  it("refuses stored audit provenance tampering at save verification", () => {
    const audit = evaluate().audit;
    const bindings = audit.archivedProjection!.bindings;
    const changed = { ...audit, archivedProjection: { observationKind: "archived" as const,
      bindings: bindings.map((binding, index) => index === 0 ? { ...binding,
        observation: { ...binding.observation, archive: { ...binding.observation.archive, fileSha256: "0".repeat(64) } } } : binding) } };
    expect(readerSummaryHasVerifiedGitHubProjection({ artifact: artifact(), audit: changed })).toBe(false);
  });
  it("leaves native live scan requirements unchanged", () => {
    expect(evaluate(githubProjectionInput(), githubBoardArtifact(), new Date("2026-07-11T01:00:00.000Z")).audit.status).toBe("verified");
    expect(evaluate(githubProjectionInput().map(item => ({ ...item, scanJobId: undefined })),
      githubBoardArtifact()).audit.status).toBe("rejected");
  });
  it("builds an explicitly dated archived watch instead of stars today", () => {
    const row = items()[0]!;
    const evidence = { ...row, interestId: "test-interest", title: "Archived repository", score: 0, whyImportant: [],
      providerMetricLabels: [{ label: `GitHub Trending archive ${day}`, value: `#1, +1,001 stars on ${day}` }] } as SummaryEvidenceItem;
    expect(selectGitHubTrendingDisplayRepositories([evidence])).toEqual([evidence]);
    const appendix = buildGitHubTrendingNarrativeAppendix({ evidence: [evidence], citations: [{
      citationId: "citation", feedItemId: row.feedItemId, sourceItemId: row.sourceItemId,
      providerKey: row.providerKey, field: "canonicalUrl", canonicalUrl: row.canonicalUrl }] });
    expect(appendix?.title).toBe(`GitHub Trending archive ${day}`);
    expect(appendix?.text).toBe(`- **owner/repo-1** (#1): +1,001 stars on ${day} (archived observation).`);
  });

  const supplementalBoard = (rows: readonly ReaderSummaryGitHubProjectionItem[],
    metric: (row: ReaderSummaryGitHubProjectionItem) => { label: string; value: string }) => {
    const evidence = rows.map((row) => ({ ...row, interestId: "test-interest",
      title: row.repositoryFullName!, score: 0, whyImportant: [],
      providerMetricLabels: [metric(row)] })) as readonly SummaryEvidenceItem[];
    const citations = rows.map((row) => ({ citationId: `github-citation-${row.rank}`,
      feedItemId: row.feedItemId, sourceItemId: row.sourceItemId,
      providerKey: row.providerKey, field: "canonicalUrl" as const, canonicalUrl: row.canonicalUrl }));
    return { evidence, citations };
  };

  it("materializes and verifies a 9-row archived board through the production supplemental builder", () => {
    const rows = items().slice(0, 9);
    const { evidence, citations } = supplementalBoard(rows, (row) => ({
      label: `GitHub Trending archive ${day}`,
      value: `#${row.rank}, +${row.starsGained!.toLocaleString("en-US")} stars on ${day}` }));
    const posts = buildReaderSummarySupplementalTrendSelectedPosts({
      selectedEvidence: evidence, citations });
    expect(posts).toHaveLength(9);
    const appendix = buildGitHubTrendingNarrativeAppendix({ evidence, citations });
    const base = githubBoardArtifact({ selectedPostCount: 9 }).toSnapshot();
    const artifact = ReaderSummaryArtifact.create({ ...base, content: { ...base.content!,
      selectedPosts: [...posts],
      narrativeSections: [...base.content!.narrativeSections!,
        ...(appendix === undefined ? [] : [appendix])] } });
    const result = evaluate(rows, artifact);
    expect(result.findings).toEqual([]);
    expect(result.audit.status).toBe("verified");
    expect(readerSummaryHasVerifiedGitHubProjection({ artifact, audit: result.audit })).toBe(true);
  });

  it("keeps materializing the complete live Top 10 board", () => {
    const rows = githubProjectionInput();
    const { evidence, citations } = supplementalBoard(rows, (row) => ({
      label: "GitHub Trending today",
      value: `#${row.rank}, +${row.starsGained} stars today` }));
    expect(buildReaderSummarySupplementalTrendSelectedPosts({
      selectedEvidence: evidence, citations })).toHaveLength(10);
  });

  it("still refuses an incomplete live board from the production supplemental builder", () => {
    const rows = githubProjectionInput().slice(0, 9);
    const { evidence, citations } = supplementalBoard(rows, (row) => ({
      label: "GitHub Trending today",
      value: `#${row.rank}, +${row.starsGained} stars today` }));
    expect(buildReaderSummarySupplementalTrendSelectedPosts({
      selectedEvidence: evidence, citations })).toEqual([]);
  });
});
