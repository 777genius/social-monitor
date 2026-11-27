/**
 * Summary-owned view of a validated Ingestion GitHub Trending archive record.
 * Ingestion remains the sole parser and custody validator. This structural
 * type creates no runtime conversion, normalization, or second validator.
 */
export type ReaderSummaryGitHubArchiveProvenance = {
  readonly repository: string;
  readonly commit: string;
  readonly gitBlobSha1: string;
  readonly filePath: string;
  readonly fileSha256: string;
  readonly originalSourceUrl: string;
  readonly serializedAt: string;
  readonly committedAt: string;
  readonly acquiredAt: string;
};

export type ReaderSummaryGitHubArchiveSnapshot = {
  readonly kind: 'github_trending_page_repository';
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly description?: string;
    readonly language?: string;
    readonly totalStars: number;
    readonly forksCount: number;
  };
  readonly trending: {
    readonly observationKind: 'archived';
    readonly window: 'daily';
    readonly source: 'github_trending_archive';
    readonly rank: number;
    readonly originalArchiveRank: number;
    readonly starsGained: number;
    readonly snapshotContentHash: string;
    readonly scanJobId: null;
    readonly fetchStartedAt: null;
    readonly checkedAt: null;
  };
  readonly archive: ReaderSummaryGitHubArchiveProvenance;
};
