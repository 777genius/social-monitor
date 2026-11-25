import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  certifyReaderSummaryWeeklyDailyEvidence,
  readerSummaryWeeklyCanonicalProviderKeys,
  readerSummaryWeeklyDailyArtifactSchemaVersion,
  readerSummaryWeeklyDailyCertificationSchemaVersion,
  readerSummaryWeeklyDailyProofSchemaVersion,
  readerSummaryWeeklyDailyReportSchemaVersion,
  readerSummaryWeeklyRequiredDailyBlockingGateNames,
  type ReaderSummaryWeeklyDailyArtifactPayloadInput,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
  type ReaderSummaryWeeklyDailyExactProofInput,
  type ReaderSummaryWeeklyDailyReportPayloadInput,
  type ReaderSummaryWeeklyGitHubBindingInput,
  type ReaderSummaryWeeklyProviderCountsInput,
} from "./reader-summary-weekly-daily-certification";
import {
  certifyReaderSummaryWeeklyGitHubAudit,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyCanonicalGitHubAudit,
  type ReaderSummaryWeeklyGitHubAuditEvidenceInput,
} from "./reader-summary-weekly-github-audit";

const day = "2026-07-20";
const sha = (value: number): string => value.toString(16).padStart(64, "0");
const scope = (): ReaderSummaryWeeklyManifestScope => ({ type: "workspace" });
const mutable = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

const githubEvidence = (): ReaderSummaryWeeklyGitHubAuditEvidenceInput => ({
  requestedUtcDay: day,
  scanJobId: "github-scan-2026-07-20",
  providerKey: readerSummaryWeeklyGitHubProviderKey,
  kind: readerSummaryWeeklyGitHubEvidenceKind,
  sourceBindingId: "github-trending-binding",
  fetchStartedAt: `${day}T08:00:00.000Z`,
  checkedAt: `${day}T10:05:00.000Z`,
  observedAt: "2026-07-21T00:00:24.435Z",
  repositories: Array.from({ length: 10 }, (_, index) => ({
    requestedUtcDay: day,
    scanJobId: "github-scan-2026-07-20",
    providerKey: readerSummaryWeeklyGitHubProviderKey,
    kind: readerSummaryWeeklyGitHubEvidenceKind,
    sourceBindingId: "github-trending-binding",
    fetchStartedAt: `${day}T08:00:00.000Z`,
    checkedAt: `${day}T10:05:00.000Z`,
    publishedAt: `${day}T09:${String(index).padStart(2, "0")}:00.000Z`,
    observedAt: "2026-07-21T00:00:24.435Z",
    rank: index + 1,
    canonicalUrl: `https://github.com/owner/repo-${index + 1}`,
    sourceEvidence: {
      heading: `owner/repo-${index + 1}`,
      description: `Repository ${index + 1} evidence`,
      primaryLanguage: "TypeScript",
      starsToday: 100 - index,
      totalStars: 1_000 + index,
      forks: 100 + index,
    },
  })),
});

const githubBinding = (
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyGitHubBindingInput => ({
  requestedUtcDay: audit.requestedUtcDay,
  scanJobId: audit.scanJobId,
  providerKey: audit.providerKey,
  kind: audit.kind,
  sourceBindingId: audit.sourceBindingId,
});

const providerCounts = (): ReaderSummaryWeeklyProviderCountsInput => ({
  "github-trending-page": 10,
  "hacker-news": 1,
  reddit: 1,
  rss: 1,
  "x-twitter": 1,
});

const dailyEvidence = (
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyDailyCertificationEvidenceInput => {
  const authority = {
    requestedUtcDate: day,
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    publicationId: "publication-2026-07-20",
    artifactId: "artifact-2026-07-20",
    jobId: "job-2026-07-20",
    reportId: "report-2026-07-20",
    proofId: "proof-2026-07-20",
  };
  const artifactPayload: ReaderSummaryWeeklyDailyArtifactPayloadInput = {
    schemaVersion: readerSummaryWeeklyDailyArtifactSchemaVersion,
    ...authority,
    scope: scope(),
    period: readerSummaryWeeklyDailyPeriod(day),
    githubBinding: githubBinding(audit),
    providerEvidence: [
      ...audit.repositories.map((repository, index) => ({
        evidenceId: `github-evidence-${index + 1}`,
        providerKey: readerSummaryWeeklyGitHubProviderKey,
        sourceBindingId: audit.sourceBindingId,
        repositoryIdentity: repository.repositoryIdentity,
      })),
      ...readerSummaryWeeklyCanonicalProviderKeys
        .filter((providerKey) => providerKey !== readerSummaryWeeklyGitHubProviderKey)
        .map((providerKey, index) => ({
          evidenceId: `${providerKey}-evidence`,
          providerKey,
          sourceBindingId: `${providerKey}-binding`,
          sourceEvidence: {
            sourceRecordId: `${providerKey}-record`,
            observedAt: `${day}T12:0${index}:00.000Z`,
            title: `${providerKey} evidence`,
            content: `${providerKey} bounded canonical content`,
          },
        })),
    ],
  };
  const artifactSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactPayload,
  ).sha256;
  const reportPayload: ReaderSummaryWeeklyDailyReportPayloadInput = {
    schemaVersion: readerSummaryWeeklyDailyReportSchemaVersion,
    requestedUtcDate: day,
    tenantId: authority.tenantId,
    workspaceId: authority.workspaceId,
    scope: scope(),
    period: readerSummaryWeeklyDailyPeriod(day),
    publicationId: authority.publicationId,
    reportId: authority.reportId,
    artifactBinding: {
      artifactId: authority.artifactId,
      jobId: authority.jobId,
      proofId: authority.proofId,
      artifactSha256,
    },
    githubBinding: githubBinding(audit),
    providerCounts: providerCounts(),
    blockingGates: Object.fromEntries(
      readerSummaryWeeklyRequiredDailyBlockingGateNames.map((name) => [
        name,
        true,
      ]),
    ) as Record<
      (typeof readerSummaryWeeklyRequiredDailyBlockingGateNames)[number],
      boolean
    >,
  };
  const reportSha256 = canonicalizeReaderSummaryWeeklyJson(reportPayload).sha256;
  const exactProof: ReaderSummaryWeeklyDailyExactProofInput = {
    schemaVersion: readerSummaryWeeklyDailyProofSchemaVersion,
    ...authority,
    scope: scope(),
    period: readerSummaryWeeklyDailyPeriod(day),
    reportSha256,
    artifactSha256,
    githubBinding: githubBinding(audit),
    providerCounts: providerCounts(),
    blockingGateNames: [...readerSummaryWeeklyRequiredDailyBlockingGateNames],
  };
  return {
    ...authority,
    scope: scope(),
    reportPayload,
    exactProof,
    artifactPayload,
  };
};

const refreshEvidenceBindings = (
  input: ReaderSummaryWeeklyDailyCertificationEvidenceInput,
): void => {
  const artifactSha256 = canonicalizeReaderSummaryWeeklyJson(
    input.artifactPayload,
  ).sha256;
  mutable(input.reportPayload.artifactBinding).artifactSha256 = artifactSha256;
  mutable(input.exactProof).artifactSha256 = artifactSha256;
  mutable(input.exactProof).reportSha256 =
    canonicalizeReaderSummaryWeeklyJson(input.reportPayload).sha256;
};

describe("reader summary weekly daily certification", () => {
  it("derives one deterministic immutable certification from bounded evidence", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const input = dailyEvidence(audit);
    const certification = certifyReaderSummaryWeeklyDailyEvidence(input, audit);
    const repeated = certifyReaderSummaryWeeklyDailyEvidence(
      dailyEvidence(audit),
      audit,
    );
    const { identity, sha256, ...body } = certification;

    expect(certification).toEqual(repeated);
    expect(certification.status).toBe("certified");
    expect(certification.blockingPassed).toBe(true);
    expect(certification.schemaVersion).toBe(
      readerSummaryWeeklyDailyCertificationSchemaVersion,
    );
    expect(certification.reportSha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(input.reportPayload).sha256,
    );
    expect(certification.exactProofSha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(input.exactProof).sha256,
    );
    expect(certification.artifactPayloadSha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(input.artifactPayload).sha256,
    );
    expect(sha256).toBe(canonicalizeReaderSummaryWeeklyJson(body).sha256);
    expect(identity).toBe(
      `${readerSummaryWeeklyDailyCertificationSchemaVersion}:${sha256}`,
    );
    expect(Object.isFrozen(certification)).toBe(true);
    expect(Object.isFrozen(certification.providerCounts)).toBe(true);
    expect(Object.isFrozen(certification.providerCounts[0])).toBe(true);
  });

  it("does not retain mutable caller evidence", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const input = dailyEvidence(audit);
    const certification = certifyReaderSummaryWeeklyDailyEvidence(input, audit);

    mutable(input).tenantId = "mutated";
    mutable(input.artifactPayload.providerEvidence[0]).evidenceId = "mutated";

    expect(certification.tenantId).toBe("tenant-a");
    expect(certification.providerCounts[0]!.count).toBe(10);
    expect(() => {
      mutable(certification.providerCounts[0]).count = 99;
    }).toThrow(TypeError);
  });

  it.each([
    ["artifact tenant", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.artifactPayload).tenantId = "tenant-b"; }],
    ["report workspace", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.reportPayload).workspaceId = "workspace-b"; }],
    ["proof scope", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.exactProof).scope = { type: "interest", interestId: "other" }; }],
    ["publication", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.reportPayload).publicationId = "other-publication"; }],
    ["artifact", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.reportPayload.artifactBinding).artifactId = "other-artifact"; }],
    ["job", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.reportPayload.artifactBinding).jobId = "other-job"; }],
    ["report", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.exactProof).reportId = "other-report"; }],
    ["proof", (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput): void => {
      mutable(input.reportPayload.artifactBinding).proofId = "other-proof"; }],
  ] as const)("rejects mixed %s authority", (_label, alter) => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const input = dailyEvidence(audit);
    alter(input);

    expect(() =>
      certifyReaderSummaryWeeklyDailyEvidence(input, audit),
    ).toThrow();
  });

  it("rejects forged hashes, gates and caller-authoritative seals", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const cases = [
      (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput) =>
        mutable(input.reportPayload.artifactBinding).artifactSha256 = sha(900),
      (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput) =>
        mutable(input.exactProof).reportSha256 = sha(901),
      (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput) =>
        mutable(input.exactProof).artifactSha256 = sha(902),
      (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput) =>
        mutable(input.reportPayload.blockingGates).utcDayBinding = false,
      (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput) =>
        mutable(input).status = "certified",
      (input: ReaderSummaryWeeklyDailyCertificationEvidenceInput) =>
        mutable(input).sha256 = sha(903),
    ];

    for (const alter of cases) {
      const input = dailyEvidence(audit);
      alter(input);
      expect(() =>
        certifyReaderSummaryWeeklyDailyEvidence(input, audit),
      ).toThrow();
    }
  });

  it("rejects duplicate, missing and miscounted provider evidence", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const duplicate = dailyEvidence(audit);
    mutable(duplicate.artifactPayload.providerEvidence[1]).evidenceId =
      duplicate.artifactPayload.providerEvidence[0]!.evidenceId;
    const duplicateBinding = dailyEvidence(audit);
    const firstNonGitHub =
      duplicateBinding.artifactPayload.providerEvidence[10]!;
    const secondNonGitHub =
      duplicateBinding.artifactPayload.providerEvidence[11]!;
    mutable(secondNonGitHub).providerKey = firstNonGitHub.providerKey;
    mutable(secondNonGitHub).sourceBindingId = firstNonGitHub.sourceBindingId;
    mutable(secondNonGitHub).sourceEvidence = {
      ...(mutable(firstNonGitHub).sourceEvidence as Record<string, unknown>),
    };
    mutable(duplicateBinding.reportPayload.providerCounts)["hacker-news"] = 2;
    mutable(duplicateBinding.reportPayload.providerCounts).reddit = 0;
    mutable(duplicateBinding.exactProof.providerCounts)["hacker-news"] = 2;
    mutable(duplicateBinding.exactProof.providerCounts).reddit = 0;
    refreshEvidenceBindings(duplicateBinding);
    const missingBoardItem = dailyEvidence(audit);
    mutable(
      missingBoardItem.artifactPayload.providerEvidence[0],
    ).repositoryIdentity = "owner/missing";
    const wrongReportCount = dailyEvidence(audit);
    mutable(wrongReportCount.reportPayload.providerCounts)[
      readerSummaryWeeklyGitHubProviderKey
    ] = 9;
    const wrongProofCount = dailyEvidence(audit);
    mutable(wrongProofCount.exactProof.providerCounts).reddit = 2;
    const reordered = dailyEvidence(audit);
    mutable(reordered.artifactPayload).providerEvidence = [
      reordered.artifactPayload.providerEvidence[1],
      reordered.artifactPayload.providerEvidence[0],
      ...reordered.artifactPayload.providerEvidence.slice(2),
    ];
    refreshEvidenceBindings(reordered);

    for (const input of [
      duplicate,
      duplicateBinding,
      missingBoardItem,
      wrongReportCount,
      wrongProofCount,
      reordered,
    ]) {
      expect(() =>
        certifyReaderSummaryWeeklyDailyEvidence(input, audit),
      ).toThrow();
    }
  });

  it.each([
    ["sourceBindingId", (item: Record<string, unknown>): void => {
      item.sourceBindingId = "different-binding"; }],
    ["sourceRecordId", (item: Record<string, unknown>): void => {
      mutable(item.sourceEvidence).sourceRecordId = "different-record"; }],
    ["observedAt", (item: Record<string, unknown>): void => {
      mutable(item.sourceEvidence).observedAt = `${day}T13:00:00.000Z`; }],
    ["title", (item: Record<string, unknown>): void => {
      mutable(item.sourceEvidence).title = "Changed title"; }],
    ["content", (item: Record<string, unknown>): void => {
      mutable(item.sourceEvidence).content = "Changed source content"; }],
  ] as const)("changes the artifact seal when generic %s changes", (_label, alter) => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    const baseline = dailyEvidence(audit);
    const baselineCertification = certifyReaderSummaryWeeklyDailyEvidence(
      baseline,
      audit,
    );
    const changed = dailyEvidence(audit);
    const generic = changed.artifactPayload.providerEvidence[10]!;
    alter(mutable(generic));
    refreshEvidenceBindings(changed);
    const changedCertification = certifyReaderSummaryWeeklyDailyEvidence(
      changed,
      audit,
    );
    expect(changedCertification.artifactPayloadSha256).not.toBe(
      baselineCertification.artifactPayloadSha256,
    );
  });

  it("rejects opaque generic source hash injection", () => {
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubEvidence());
    for (const field of ["sourceContentHash", "sourceProviderContentHash"]) {
      const injected = dailyEvidence(audit);
      mutable(injected.artifactPayload.providerEvidence[10])[field] = sha(999);
      expect(() =>
        certifyReaderSummaryWeeklyDailyEvidence(injected, audit),
      ).toThrow(`derived field "${field}"`);
    }
  });
});
