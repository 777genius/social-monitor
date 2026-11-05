import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { deriveReaderSummaryWeeklyPublicationEvidence } from "../../libs/summary/domain";
import { readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  assertReaderSummaryWeeklyPublicationEvidenceRow,
  stableJson,
} from "./reader-summary-weekly-publication-evidence-postgres-contract";

type ContractClient =
  Parameters<typeof assertReaderSummaryWeeklyPublicationEvidenceRow>[0];

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";

describe("reader summary weekly publication evidence postgres contract", () => {
  it("certifies an honest archived_verified sub-Top-10 GitHub board", async () => {
    const { row, fixture } = boardRow("2026-09-22", "archived_verified", 9);
    await expect(
      assertReaderSummaryWeeklyPublicationEvidenceRow(
        fakeRuntimeClient(row),
        fakeCanonicalJsonAuditor(),
        fixture,
        "COMPLETED",
        "archived_verified",
      ),
    ).resolves.toBeUndefined();
  });

  it("certifies an exact verified 10-row GitHub board", async () => {
    const { row, fixture } = boardRow("2026-09-23", "verified", 10);
    await expect(
      assertReaderSummaryWeeklyPublicationEvidenceRow(
        fakeRuntimeClient(row),
        fakeCanonicalJsonAuditor(),
        fixture,
        "COMPLETED",
        "verified",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a divergent archived GitHub row count", async () => {
    const { row, fixture } = boardRow("2026-09-24", "archived_verified", 9);
    const forged = {
      ...row,
      github_evidence: { ...row.github_evidence, evidenceCount: 8 },
    };
    await expect(
      assertReaderSummaryWeeklyPublicationEvidenceRow(
        fakeRuntimeClient(forged),
        fakeCanonicalJsonAuditor(),
        fixture,
        "COMPLETED",
        "archived_verified",
      ),
    ).rejects.toThrow();
  });
});

const boardRow = (
  date: string,
  mode: "verified" | "archived_verified",
  boardSize: number,
) => {
  const providerHash = sha(`github-provider:${date}`);
  const repositories = Array.from({ length: boardSize }, (_, index) => ({
    rank: index + 1,
    citationId: `citation:${date}:github:${index}`,
    feedItemId: `feed:${date}:github:${index}`,
    sourceItemId: `source:${date}:github:${index}`,
    repositoryIdentity: `example/repo-${index}`,
    canonicalUrl: `https://github.com/example/repo-${index}`,
    sourceContentHash: sha(`github-source:${date}:${index}`),
    sourceProviderContentHash: providerHash,
  }));
  const githubBody = {
    schemaVersion: readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
    mode,
    requestedUtcDay: date,
    providerKey: "github-trending-page" as const,
    scanJobId: mode === "verified" ? `scan:${date}` : null,
    sourceBindingId: `binding:${date}`,
    evidenceCount: repositories.length,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash: providerHash,
    repositories,
  };
  const githubEvidence = {
    ...githubBody,
    sha256: canonicalizeReaderSummaryWeeklyJson(githubBody).sha256,
  };
  const providerEvidence = repositories.map((repository, index) => ({
    citationId: repository.citationId,
    citationField: "title" as const,
    feedItemId: repository.feedItemId,
    sourceItemId: repository.sourceItemId,
    sourceBindingId: `binding:${date}:${index}`,
    providerKey: "github-trending-page" as const,
    providerItemId: `provider-item:${date}:${index}`,
    canonicalUrl: repository.canonicalUrl,
    title: `Durable weekly evidence github ${date}`,
    sourceText: `Evidence body for github on ${date} with enough stable source context.`,
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
    sourceContentHash: repository.sourceContentHash,
  }));
  const artifactPayload = { qualityFlags: [] };
  const report = {
    citations: repositories.map((repository) => ({
      citationId: repository.citationId,
    })),
    artifactPayload,
  };
  const derived = deriveReaderSummaryWeeklyPublicationEvidence({
    tenantId,
    workspaceId,
    scope: { type: "workspace" },
    period: readerSummaryWeeklyDailyPeriod(date),
    requestedUtcDate: date,
    publicationId: `publication:${date}`,
    artifactId: `publication:${date}`,
    jobId: `job:${date}`,
    semanticStatus: "COMPLETED",
    report,
    exactProof: {},
    artifactPayload,
    providerEvidence,
    githubEvidence,
    publishedAt: `${date}T12:00:00.000Z`,
  });
  const {
    identity: _identity,
    sha256: _sha256,
    canonicalJson: _canonicalJson,
    byteLength: _byteLength,
    toBytes: _toBytes,
    ...canonicalRecord
  } = derived;
  void _identity;
  void _sha256;
  void _canonicalJson;
  void _byteLength;
  void _toBytes;
  const boardCount = providerEvidence.length;
  const row = {
    row_count: "1",
    publication_id: derived.publicationId,
    tenant_id: derived.tenantId,
    workspace_id: derived.workspaceId,
    job_id: derived.jobId,
    artifact_id: derived.artifactId,
    semantic_status: derived.semanticStatus,
    report,
    exact_proof: {},
    provider_evidence: derived.providerEvidence,
    github_evidence: derived.githubEvidence,
    canonical_record: canonicalRecord,
    canonical_bytes: Buffer.from(derived.toBytes()),
    canonical_sha256: derived.sha256,
    scope: derived.scope,
    period: derived.period,
    requested_utc_date: derived.requestedUtcDate,
    published_at: derived.publishedAt,
    provider_count: boardCount,
    report_citation_count: boardCount,
    github_mode: derived.githubEvidence.mode,
    github_count: derived.githubEvidence.evidenceCount,
    github_repositories: derived.githubEvidence.repositories.length,
    provider_counts: derived.providerCounts,
    stored_canonical_matches: true,
  };
  expect(stableJson(row.canonical_record)).toBe(derived.canonicalJson);
  return {
    row,
    fixture: {
      jobId: derived.jobId,
      artifactId: derived.artifactId,
      eventId: `event:${date}`,
      payload: {},
    },
  };
};

const fakeRuntimeClient = (row: unknown): ContractClient =>
  ({
    query: async () => ({ rows: [row] }),
  }) as unknown as ContractClient;

const fakeCanonicalJsonAuditor = (): ContractClient =>
  ({
    query: async (_sql: string, params: readonly string[]) => ({
      rows: [
        {
          canonical: canonicalizeReaderSummaryWeeklyJson(
            JSON.parse(params[0] ?? "{}"),
          ).json,
        },
      ],
    }),
  }) as unknown as ContractClient;

const sha = (input: string): string =>
  canonicalizeReaderSummaryWeeklyJson({ input }).sha256;
