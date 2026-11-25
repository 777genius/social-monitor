import {
  assertReaderSummaryWeeklyCanonicalGitHubAudit,
  certifyReaderSummaryWeeklyGitHubAudit,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubObservationGraceMs,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyGitHubAuditEvidenceInput,
} from "./reader-summary-weekly-github-audit";
import { canonicalizeReaderSummaryWeeklyJson } from "./reader-summary-weekly-canonical-json";

const day = "2026-07-20";
const hash = (value: number): string => value.toString(16).padStart(64, "0");

const githubEvidence = (): ReaderSummaryWeeklyGitHubAuditEvidenceInput => ({
  requestedUtcDay: day,
  scanJobId: "github-scan-2026-07-20",
  providerKey: readerSummaryWeeklyGitHubProviderKey,
  kind: readerSummaryWeeklyGitHubEvidenceKind,
  sourceBindingId: "github-trending-binding",
  fetchStartedAt: `${day}T10:00:00.000Z`,
  checkedAt: `${day}T10:05:00.000Z`,
  observedAt: `${day}T10:10:00.000Z`,
  repositories: Array.from({ length: 10 }, (_, index) => ({
    requestedUtcDay: day,
    scanJobId: "github-scan-2026-07-20",
    providerKey: readerSummaryWeeklyGitHubProviderKey,
    kind: readerSummaryWeeklyGitHubEvidenceKind,
    sourceBindingId: "github-trending-binding",
    fetchStartedAt: `${day}T10:00:00.000Z`,
    checkedAt: `${day}T10:05:00.000Z`,
    publishedAt: `${day}T10:0${index < 8 ? index + 1 : 9}:00.000Z`,
    observedAt: `${day}T10:10:00.000Z`,
    rank: index + 1,
    canonicalUrl: `https://github.com/owner/repo-${index + 1}`,
    sourceEvidence: {
      heading: `owner/repo-${index + 1}`,
      description: `Repository ${index + 1} source evidence`,
      primaryLanguage: index % 2 === 0 ? "TypeScript" : null,
      starsToday: 100 - index,
      totalStars: 1_000 + index,
      forks: 100 + index,
    },
  })),
});

const mutable = (
  value: ReaderSummaryWeeklyGitHubAuditEvidenceInput,
): Record<string, unknown> =>
  value as unknown as Record<string, unknown>;

const mutableRepository = (
  value: ReaderSummaryWeeklyGitHubAuditEvidenceInput,
  index = 0,
): Record<string, unknown> =>
  value.repositories[index] as unknown as Record<string, unknown>;

const replaceSnapshotField = (
  evidence: ReaderSummaryWeeklyGitHubAuditEvidenceInput,
  field: "fetchStartedAt" | "checkedAt" | "observedAt",
  value: string,
): void => {
  mutable(evidence)[field] = value;
  evidence.repositories.forEach((repository) => {
    (repository as unknown as Record<string, unknown>)[field] = value;
  });
};

describe("reader summary weekly GitHub audit", () => {
  it("certifies one immutable, deterministically sealed ranks 1..10 board", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const { identity, sha256, ...body } = audit;

    expect(audit.status).toBe("verified");
    expect(audit.repositories.map((repository) => repository.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(sha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(body).sha256,
    );
    expect(identity.endsWith(sha256)).toBe(true);
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.repositories)).toBe(true);
    expect(Object.isFrozen(audit.repositories[0])).toBe(true);
    expect(() =>
      assertReaderSummaryWeeklyCanonicalGitHubAudit(audit),
    ).not.toThrow();
  });

  it("rejects missing, duplicate, out-of-order and noninteger ranks", () => {
    const incomplete = githubEvidence();
    mutable(incomplete).repositories = incomplete.repositories.slice(0, 9);
    const duplicate = githubEvidence();
    mutableRepository(duplicate, 1).rank = 1;
    const outOfOrder = githubEvidence();
    mutable(outOfOrder).repositories = [
      outOfOrder.repositories[1],
      outOfOrder.repositories[0],
      ...outOfOrder.repositories.slice(2),
    ];
    const fractional = githubEvidence();
    mutableRepository(fractional).rank = 1.5;

    for (const evidence of [incomplete, duplicate, outOfOrder, fractional]) {
      expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow();
    }
  });

  it("rejects duplicate repositories and injected repository hashes", () => {
    const duplicateRepository = githubEvidence();
    mutableRepository(duplicateRepository, 1).canonicalUrl =
      duplicateRepository.repositories[0]!.canonicalUrl;
    const injectedHash = githubEvidence();
    mutableRepository(injectedHash, 1).sourceContentHash = hash(1);

    expect(() =>
      certifyReaderSummaryWeeklyGitHubAudit(duplicateRepository),
    ).toThrow("duplicate");
    expect(() =>
      certifyReaderSummaryWeeklyGitHubAudit(injectedHash),
    ).toThrow('derived field "sourceContentHash"');
  });

  it.each([
    "https://github.com/Owner/repo-1",
    "https://github.com/owner/Repo-1",
    "https://github.com/owner/repo-1/",
    "https://github.com/owner/repo-1.git",
    "https://github.com/owner/repo-1?tab=readme",
    "http://github.com/owner/repo-1",
    "https://example.com/owner/repo-1",
  ])("rejects noncanonical repository URL %s", (canonicalUrl) => {
    const evidence = githubEvidence();
    mutableRepository(evidence).canonicalUrl = canonicalUrl;

    expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow(
      "canonical GitHub URL",
    );
  });

  it("rejects every caller-supplied opaque trust field", () => {
    const cases = [
      ["sourceProviderContentHash", hash(171)],
      ["status", "verified"],
      ["verified", true],
    ] as const;
    for (const [field, value] of cases) {
      const evidence = githubEvidence();
      mutable(evidence)[field] = value;
      expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow();
    }
    const nested = githubEvidence();
    mutableRepository(nested).sourceProviderContentHash = hash(171);
    expect(() => certifyReaderSummaryWeeklyGitHubAudit(nested)).toThrow(
      'derived field "sourceProviderContentHash"',
    );
  });

  it("accepts an honest bounded next-morning observation", () => {
    const evidence = githubEvidence();
    replaceSnapshotField(
      evidence,
      "observedAt",
      "2026-07-21T00:00:24.435Z",
    );

    const audit = certifyReaderSummaryWeeklyGitHubAudit(evidence);

    expect(audit.observedAt).toBe("2026-07-21T00:00:24.435Z");
    expect(() =>
      assertReaderSummaryWeeklyCanonicalGitHubAudit(audit),
    ).not.toThrow();
  });

  it("rejects out-of-day fetch, check and publication timestamps", () => {
    const earlyFetch = githubEvidence();
    replaceSnapshotField(
      earlyFetch,
      "fetchStartedAt",
      "2026-07-19T23:59:59.999Z",
    );
    const lateCheck = githubEvidence();
    replaceSnapshotField(
      lateCheck,
      "checkedAt",
      "2026-07-21T00:00:00.000Z",
    );
    replaceSnapshotField(
      lateCheck,
      "observedAt",
      "2026-07-21T00:00:00.001Z",
    );
    const latePublication = githubEvidence();
    mutableRepository(latePublication).publishedAt =
      "2026-07-21T00:00:00.000Z";

    for (const evidence of [earlyFetch, lateCheck, latePublication]) {
      expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow(
        "inside requested UTC day",
      );
    }
  });

  it("rejects late, backdated and incoherently ordered observations", () => {
    const late = githubEvidence();
    replaceSnapshotField(
      late,
      "observedAt",
      new Date(
        Date.parse("2026-07-21T00:00:00.000Z") +
          readerSummaryWeeklyGitHubObservationGraceMs +
          1,
      ).toISOString(),
    );
    const backdated = githubEvidence();
    replaceSnapshotField(
      backdated,
      "observedAt",
      `${day}T10:04:59.999Z`,
    );
    const mixed = githubEvidence();
    mutableRepository(mixed, 2).checkedAt = `${day}T10:06:00.000Z`;
    const reversed = githubEvidence();
    mutable(reversed).checkedAt = `${day}T10:11:00.000Z`;

    for (const evidence of [late, backdated, mixed, reversed]) {
      expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow();
    }
  });

  it("rejects hybrid scans with mixed date, job, binding or provider authority", () => {
    const cases = [
      ["requestedUtcDay", "2026-07-21"],
      ["scanJobId", "different-scan"],
      ["sourceBindingId", "different-binding"],
      ["providerKey", "github"],
      ["kind", "other_kind"],
      ["fetchStartedAt", `${day}T10:00:01.000Z`],
      ["observedAt", `${day}T10:09:59.000Z`],
    ] as const;

    for (const [field, replacement] of cases) {
      const evidence = githubEvidence();
      mutableRepository(evidence, 4)[field] = replacement;
      expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow();
    }
  });

  it("rejects unknown keys and caller-supplied derived fields", () => {
    const unknown = githubEvidence();
    mutable(unknown).extra = true;
    const forged = githubEvidence();
    mutable(forged).status = "verified";
    const nestedForged = githubEvidence();
    mutableRepository(nestedForged).repositoryIdentity = "owner/repo-1";

    for (const evidence of [unknown, forged, nestedForged]) {
      expect(() => certifyReaderSummaryWeeklyGitHubAudit(evidence)).toThrow();
    }
  });

  it("rejects forged seals by revalidating every canonical audit field", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const forgedHash = structuredClone(audit) as unknown as Record<
      string,
      unknown
    >;
    forgedHash.sha256 = hash(999);
    const forgedIdentity = structuredClone(audit) as unknown as Record<
      string,
      unknown
    >;
    forgedIdentity.identity = "forged";
    const forgedRepository = structuredClone(audit);
    (
      forgedRepository.repositories[0] as unknown as Record<string, unknown>
    ).repositoryIdentity = "forged/repository";

    for (const value of [forgedHash, forgedIdentity, forgedRepository]) {
      expect(() =>
        assertReaderSummaryWeeklyCanonicalGitHubAudit(value),
      ).toThrow();
    }
  });
});
