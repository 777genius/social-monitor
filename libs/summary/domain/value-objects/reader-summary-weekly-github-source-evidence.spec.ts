import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklySha256,
} from "./reader-summary-weekly-canonical-json";
import {
  canonicalReaderSummaryWeeklyGitHubProviderAuthority,
  certifyReaderSummaryWeeklyGitHubSourceEvidence,
  deriveReaderSummaryWeeklyGitHubBoardContentHash,
  readerSummaryWeeklyGitHubBoardEvidenceSchemaVersion,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyCanonicalGitHubSourceEvidence,
  type ReaderSummaryWeeklyGitHubProviderAuthority,
  type ReaderSummaryWeeklyGitHubRepositoryEvidenceInput,
} from "./reader-summary-weekly-github-source-evidence";

const day = "2026-07-20";
const authority = (
  scanJobId = "github-scan-2026-07-20",
): ReaderSummaryWeeklyGitHubProviderAuthority =>
  canonicalReaderSummaryWeeklyGitHubProviderAuthority({
    requestedUtcDay: day,
    scanJobId,
    providerKey: readerSummaryWeeklyGitHubProviderKey,
    kind: readerSummaryWeeklyGitHubEvidenceKind,
    sourceBindingId: "github-trending-binding",
    fetchStartedAt: `${day}T10:00:00.000Z`,
    checkedAt: `${day}T10:05:00.000Z`,
    observedAt: `${day}T10:10:00.000Z`,
  });

const repositoryEvidence = (
  rank = 1,
  providerAuthority = authority(),
): ReaderSummaryWeeklyGitHubRepositoryEvidenceInput => ({
  ...providerAuthority,
  publishedAt: `${day}T10:0${Math.min(rank, 9)}:00.000Z`,
  rank,
  canonicalUrl: `https://github.com/owner/repo-${rank}`,
  sourceEvidence: {
    heading: `owner/repo-${rank}`,
    description: `Repository ${rank} bounded source evidence`,
    primaryLanguage: rank % 2 === 0 ? "TypeScript" : null,
    starsToday: 100 - rank,
    totalStars: 1_000 + rank,
    forks: 100 + rank,
  },
});

const board = (
  providerAuthority = authority(),
): readonly ReaderSummaryWeeklyCanonicalGitHubSourceEvidence[] =>
  Array.from({ length: 10 }, (_, index) =>
    certifyReaderSummaryWeeklyGitHubSourceEvidence(
      repositoryEvidence(index + 1, providerAuthority),
      providerAuthority,
    ),
  );

const mutable = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

describe("reader summary weekly GitHub source evidence", () => {
  it("derives a deterministic SHA-256 from the complete canonical evidence bytes", () => {
    const providerAuthority = authority();
    const input = repositoryEvidence(1, providerAuthority);
    const first = certifyReaderSummaryWeeklyGitHubSourceEvidence(
      input,
      providerAuthority,
    );
    const repeated = certifyReaderSummaryWeeklyGitHubSourceEvidence(
      repositoryEvidence(1, providerAuthority),
      providerAuthority,
    );

    expect(first).toEqual(repeated);
    expect(first.sourceContentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(readerSummaryWeeklySha256(
      canonicalizeReaderSummaryWeeklyJson({
        schemaVersion: "reader_summary.weekly_github_source_evidence.v1",
        ...providerAuthority,
        publishedAt: first.publishedAt,
        rank: first.rank,
        canonicalUrl: first.canonicalUrl,
        repositoryIdentity: first.repositoryIdentity,
        sourceEvidence: first.sourceEvidence,
      }).toBytes(),
    )).toBe(first.sourceContentHash);
  });

  it.each([
    ["publishedAt", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input).publishedAt = `${day}T10:09:30.000Z`; }],
    ["rank", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input).rank = 2; }],
    ["canonicalUrl", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input).canonicalUrl = "https://github.com/owner/other"; }],
    ["heading", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input.sourceEvidence).heading = "owner/other"; }],
    ["description", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input.sourceEvidence).description = "Changed evidence"; }],
    ["primaryLanguage", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input.sourceEvidence).primaryLanguage = "Rust"; }],
    ["starsToday", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input.sourceEvidence).starsToday = 999; }],
    ["totalStars", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input.sourceEvidence).totalStars = 9_999; }],
    ["forks", (input: ReaderSummaryWeeklyGitHubRepositoryEvidenceInput): void => {
      mutable(input.sourceEvidence).forks = 999; }],
  ] as const)("changes the internally-derived hash when %s changes", (_label, alter) => {
    const providerAuthority = authority();
    const baseline = certifyReaderSummaryWeeklyGitHubSourceEvidence(
      repositoryEvidence(1, providerAuthority),
      providerAuthority,
    );
    const changedInput = repositoryEvidence(1, providerAuthority);
    alter(changedInput);
    const changed = certifyReaderSummaryWeeklyGitHubSourceEvidence(
      changedInput,
      providerAuthority,
    );

    expect(changed.sourceContentHash).not.toBe(baseline.sourceContentHash);
  });

  it("binds every mutable provider-authority field into the source hash", () => {
    const baselineAuthority = authority();
    const baseline = certifyReaderSummaryWeeklyGitHubSourceEvidence(
      repositoryEvidence(1, baselineAuthority),
      baselineAuthority,
    );
    const variants = [
      canonicalReaderSummaryWeeklyGitHubProviderAuthority({
        ...baselineAuthority,
        requestedUtcDay: "2026-07-21",
        fetchStartedAt: "2026-07-21T10:00:00.000Z",
        checkedAt: "2026-07-21T10:05:00.000Z",
        observedAt: "2026-07-21T10:10:00.000Z",
      }),
      canonicalReaderSummaryWeeklyGitHubProviderAuthority({
        ...baselineAuthority,
        scanJobId: "different-scan",
      }),
      canonicalReaderSummaryWeeklyGitHubProviderAuthority({
        ...baselineAuthority,
        sourceBindingId: "different-binding",
      }),
      canonicalReaderSummaryWeeklyGitHubProviderAuthority({
        ...baselineAuthority,
        fetchStartedAt: `${day}T09:59:59.999Z`,
      }),
      canonicalReaderSummaryWeeklyGitHubProviderAuthority({
        ...baselineAuthority,
        checkedAt: `${day}T10:06:00.000Z`,
      }),
      canonicalReaderSummaryWeeklyGitHubProviderAuthority({
        ...baselineAuthority,
        observedAt: `${day}T10:11:00.000Z`,
      }),
    ];

    for (const variant of variants) {
      const input = repositoryEvidence(1, variant);
      mutable(input).publishedAt = `${variant.requestedUtcDay}T10:01:00.000Z`;
      const changed = certifyReaderSummaryWeeklyGitHubSourceEvidence(
        input,
        variant,
      );
      expect(changed.sourceContentHash).not.toBe(
        baseline.sourceContentHash,
      );
    }
  });

  it("rejects opaque hash and trust-state injection at every evidence level", () => {
    const providerAuthority = authority();
    for (const [field, value] of [
      ["sourceContentHash", "a".repeat(64)],
      ["sourceProviderContentHash", "b".repeat(64)],
      ["status", "verified"],
      ["verified", true],
    ] as const) {
      const input = repositoryEvidence(1, providerAuthority);
      mutable(input)[field] = value;
      expect(() =>
        certifyReaderSummaryWeeklyGitHubSourceEvidence(
          input,
          providerAuthority,
        ),
      ).toThrow();
    }
    const nested = repositoryEvidence(1, providerAuthority);
    mutable(nested.sourceEvidence).sourceContentHash = "a".repeat(64);
    expect(() =>
      certifyReaderSummaryWeeklyGitHubSourceEvidence(
        nested,
        providerAuthority,
      ),
    ).toThrow('derived field "sourceContentHash"');
  });

  it("derives the board hash from provider authority and ordered internal hashes", () => {
    const providerAuthority = authority();
    const repositories = board(providerAuthority);
    const hash = deriveReaderSummaryWeeklyGitHubBoardContentHash(
      providerAuthority,
      repositories,
    );
    const expected = canonicalizeReaderSummaryWeeklyJson({
      schemaVersion: readerSummaryWeeklyGitHubBoardEvidenceSchemaVersion,
      ...providerAuthority,
      repositorySourceContentHashes: repositories.map(
        (repository) => repository.sourceContentHash,
      ),
    }).sha256;

    expect(hash).toBe(expected);
    expect(deriveReaderSummaryWeeklyGitHubBoardContentHash(
      providerAuthority,
      board(providerAuthority),
    )).toBe(hash);
    expect(deriveReaderSummaryWeeklyGitHubBoardContentHash(
      authority("different-scan"),
      board(authority("different-scan")),
    )).not.toBe(hash);

    const forged = repositories.map((repository) => ({ ...repository }));
    mutable(forged[0]).sourceContentHash = "a".repeat(64);
    expect(() =>
      deriveReaderSummaryWeeklyGitHubBoardContentHash(
        providerAuthority,
        forged,
      ),
    ).toThrow("forged source evidence");
  });

  it("rejects board reordering and cannot preserve identity by reranking", () => {
    const providerAuthority = authority();
    const repositories = board(providerAuthority);
    const reordered = [
      repositories[1]!,
      repositories[0]!,
      ...repositories.slice(2),
    ];

    expect(() =>
      deriveReaderSummaryWeeklyGitHubBoardContentHash(
        providerAuthority,
        reordered,
      ),
    ).toThrow("ordered ranks");

    const rerankedInputs = [
      repositoryEvidence(2, providerAuthority),
      repositoryEvidence(1, providerAuthority),
      ...Array.from({ length: 8 }, (_, index) =>
        repositoryEvidence(index + 3, providerAuthority),
      ),
    ];
    mutable(rerankedInputs[0]).rank = 1;
    mutable(rerankedInputs[1]).rank = 2;
    const reranked = rerankedInputs.map((input) =>
      certifyReaderSummaryWeeklyGitHubSourceEvidence(input, providerAuthority),
    );
    expect(deriveReaderSummaryWeeklyGitHubBoardContentHash(
      providerAuthority,
      reranked,
    )).not.toBe(deriveReaderSummaryWeeklyGitHubBoardContentHash(
      providerAuthority,
      repositories,
    ));
  });

  it("deep-freezes output and retains no mutable caller evidence", () => {
    const providerAuthority = authority();
    const input = repositoryEvidence(1, providerAuthority);
    const source = certifyReaderSummaryWeeklyGitHubSourceEvidence(
      input,
      providerAuthority,
    );
    const sealedHash = source.sourceContentHash;
    mutable(input.sourceEvidence).description = "Caller mutation";

    expect(source.sourceEvidence.description).toBe(
      "Repository 1 bounded source evidence",
    );
    expect(source.sourceContentHash).toBe(sealedHash);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.sourceEvidence)).toBe(true);
    expect(() => {
      mutable(source.sourceEvidence).description = "Nested mutation";
    }).toThrow(TypeError);
    expect(source.sourceContentHash).toBe(sealedHash);
  });
});
