import { buildReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import {
  buildHistoricalPromotionCanonicalInput,
  type HistoricalPromotionSupportingEvidence,
} from "./reader-summary-promotion-v2-historical-input";

const date = "2026-08-01";
const sourcePublication = {
  kind: "active-database-publication" as const,
  publicationId: "00000000-0000-4000-8000-000000000101",
  artifactId: "00000000-0000-4000-8000-000000000102",
  reportSha256: "a".repeat(64),
  proofSha256: "b".repeat(64),
};

describe("historical Promotion V2 canonical input identity", () => {
  it.each([
    ["title", { title: "Changed title" }],
    ["body", { bodyPreview: "Changed body", sourceBody: "Changed source" }],
    ["canonical URL", { canonicalUrl: "https://changed.example/item" }],
    ["source row", { sourceTitle: "Changed source title" }],
    ["provider metadata", { providerMetadata: { score: 999 } }],
    ["provider", { providerKey: "hacker-news" }],
  ] as const)("changes when ranking-relevant %s changes", (_name, change) => {
    const original = canonicalInput();
    const changed = canonicalInput({ row: change });

    expect(changed.datasetAggregate).not.toBe(original.datasetAggregate);
    expect(changed.digest).not.toBe(original.digest);
  });

  it("changes when GitHub eligibility changes", () => {
    const original = canonicalInput();
    const changed = canonicalInput({
      eligibilityRows: [{ rowJson: '{"bindingStatus":"DISABLED"}' }],
    });

    expect(changed.datasetAggregate).not.toBe(original.datasetAggregate);
    expect(changed.digest).not.toBe(original.digest);
  });

  it("keeps semantic identity stable across capture time and file SHA", () => {
    const original = canonicalInput({
      generatedAt: new Date("2026-08-31T11:55:00.000Z"),
      datasetManifestSha256: "e".repeat(64),
    });
    const recaptured = canonicalInput({
      generatedAt: new Date("2026-08-31T12:25:00.000Z"),
      datasetManifestSha256: "f".repeat(64),
    });

    expect(recaptured.digest).toBe(original.digest);
    expect(recaptured.datasetAggregate).toBe(original.datasetAggregate);
  });

  it.each([
    ["source publication report", { reportSha256: "c".repeat(64) }],
    ["source publication proof", { proofSha256: "d".repeat(64) }],
  ] as const)("binds the immutable %s", (_name, sourceChange) => {
    const original = canonicalInput();
    const changed = canonicalInput({ sourceChange });
    expect(changed.digest).not.toBe(original.digest);
  });

  it("binds every preserved evidence-file digest", () => {
    const original = canonicalInput({ supportingEvidence: legacyEvidence() });
    for (const field of [
      "sourceReportSha256",
      "collectionArtifactSha256",
      "collectionQualityReportSha256",
    ] as const) {
      const changed = canonicalInput({
        supportingEvidence: {
          ...legacyEvidence(),
          [field]: "f".repeat(64),
        },
      });
      expect(changed.digest).not.toBe(original.digest);
    }
  });
});

const canonicalInput = (overrides: {
  readonly row?: Readonly<Record<string, unknown>>;
  readonly eligibilityRows?: readonly { rowJson: string }[];
  readonly sourceChange?: Readonly<Record<string, string>>;
  readonly supportingEvidence?: HistoricalPromotionSupportingEvidence;
  readonly generatedAt?: Date;
  readonly datasetManifestSha256?: string;
} = {}) => {
  const manifest = buildReaderSummaryDayDatasetManifest({
    tenantId: "00000000-0000-4000-8000-000000000501",
    workspaceId: "00000000-0000-4000-8000-000000000502",
    startedAt: new Date(`${date}T00:00:00.000Z`),
    endedAt: new Date("2026-08-02T00:00:00.000Z"),
    generatedAt: overrides.generatedAt ??
      new Date("2026-08-31T11:55:00.000Z"),
    feedRows: [{
      providerKey: String(overrides.row?.providerKey ?? "reddit"),
      rowJson: JSON.stringify({
        feedItemId: "feed-1",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.example/item",
        title: "Original title",
        bodyPreview: "Original body",
        providerMetadata: { score: 80, upvoteRatio: 0.9 },
        sourceProviderKey: "reddit",
        sourceProviderItemId: "source-1",
        sourceCanonicalUrl: "https://reddit.example/source",
        sourceTitle: "Original source title",
        sourceBody: "Original source body",
        sourceMetadata: { kind: "reddit_post" },
        ...overrides.row,
      }),
    }],
    eligibilityRows: overrides.eligibilityRows ?? [
      { rowJson: '{"bindingStatus":"ACTIVE"}' },
    ],
  });
  const built = buildHistoricalPromotionCanonicalInput({
    date,
    sourcePublication: { ...sourcePublication, ...overrides.sourceChange },
    datasetManifest: manifest,
    datasetManifestSha256:
      overrides.datasetManifestSha256 ?? "e".repeat(64),
    supportingEvidence: overrides.supportingEvidence ?? {
      kind: "active-database-publication",
    },
    allowHistoricalGitHubOmission: false,
  });
  return {
    digest: built.authoritativeInputDigest,
    datasetAggregate: manifest.dataset.aggregateSha256,
  };
};

const legacyEvidence = () => ({
  kind: "preserved-production-day-report" as const,
  sourceReportSha256: "1".repeat(64),
  collectionArtifactSha256: "2".repeat(64),
  collectionQualityReportSha256: "3".repeat(64),
});
