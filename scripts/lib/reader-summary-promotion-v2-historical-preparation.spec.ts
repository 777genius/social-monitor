import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentDatabaseAccess } from "@social-monitor/platform-persistence";

import { buildReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import { historicalPromotionRebuildIdentity } from
  "./reader-summary-promotion-v2-historical-classification";
import { readerSummaryProductionDayScope } from
  "./reader-summary-production-day-scope";
import { resolveProductionDayExecutionRequest } from
  "./reader-summary-production-day-reuse-provenance";
import { loadHistoricalPromotionEvidenceManifest } from
  "./reader-summary-promotion-v2-historical-files";
import { PostgresHistoricalPromotionPreparationReader } from
  "./reader-summary-promotion-v2-historical-preparation-postgres";
import {
  ReaderSummaryPromotionV2HistoricalPreparation,
  writeHistoricalPromotionPreparation,
} from "./reader-summary-promotion-v2-historical-preparation";
import {
  ReaderSummaryPromotionV2HistoricalRunner,
  type HistoricalPromotionMutationOutcome,
} from "./reader-summary-promotion-v2-historical-runner";
import { historicalPromotionProductionDayCommand } from
  "./reader-summary-promotion-v2-historical-subprocess";

const date = "2026-08-01";
const now = new Date("2026-08-31T12:00:00.000Z");

describe("historical Promotion V2 active-publication preparation", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "reader-promotion-prepare-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("prepares and executes a rebuildable date with no old success report", async () => {
    const dependencies = preparationDependencies();
    const preparation = new ReaderSummaryPromotionV2HistoricalPreparation({
      ...dependencies,
      clock: () => now,
    });
    const results = await preparation.prepare({
      dates: [date],
      batchSize: 2,
      timestampPolicy: "published_at",
    });
    const paths = writeHistoricalPromotionPreparation({
      outputDirectory: directory,
      generatedAt: now.toISOString(),
      results,
    });
    const rawManifest = readFileSync(paths.manifestPath, "utf8");
    expect(rawManifest).not.toMatch(
      /sourceReport|collectionArtifact|collectionQualityReport/u,
    );

    const loaded = loadHistoricalPromotionEvidenceManifest({
      path: paths.manifestPath,
      dates: [date],
    });
    const bundle = loaded.bundles.get(date)!;
    const rebuildInput = {
      date,
      rebuildIdentity: historicalPromotionRebuildIdentity({
        date,
        authoritativeInputDigest: bundle.authoritativeInputDigest,
      }),
      classification: {
        ...classification(),
        policyVersion: "reader_post_promotion.v2" as const,
      },
      bundle,
    };
    const command = historicalPromotionProductionDayCommand(rebuildInput);
    const scriptIndex = command.findIndex((value) =>
      value.endsWith("run-reader-summary-production-day.ts"));
    const request = resolveProductionDayExecutionRequest(
      command.slice(scriptIndex + 1),
    );
    expect(request).toMatchObject({
      mode: "historical-regeneration",
      sourceEvidence: { kind: "active-database-publication" },
      promotionRebuild: {
        sourceAuthorityKind: "active-database-publication",
        authoritativeInputDigest: bundle.authoritativeInputDigest,
      },
    });

    const rebuild = jest.fn(async (): Promise<HistoricalPromotionMutationOutcome> => ({
      status: "completed",
      fenceToken: `reader-summary-date:${date}:1`,
      output: verifiedOutput(),
    }));
    const runner = new ReaderSummaryPromotionV2HistoricalRunner({
      authority: dependencies.authority,
      durableState: { reconcile: async () => ({ state: "none" }) },
      mutation: {
        rebuild,
        verifyCompleted: async () => verifiedOutput(),
      },
      receipts: { load: async () => null, save: async () => undefined },
      clock: () => now,
    });
    const [receipt] = await runner.run({
      dates: [date],
      batchSize: 2,
      dryRun: false,
      resume: false,
      now,
      evidence: loaded.bundles,
      evidenceProblems: loaded.problems,
    });

    expect(receipt).toMatchObject({
      status: "completed",
      identity: { authoritativeInputDigest: bundle.authoritativeInputDigest },
      pointerSwitch: {
        authority: "PrismaReaderSummaryPublication.publish_reader_summary",
        switched: true,
      },
    });
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("keeps missing posts and missing active proof honest", async () => {
    const missingPosts = new ReaderSummaryPromotionV2HistoricalPreparation({
      authority: { inspect: async () => ({
        rows: [],
        engagementSnapshotCount: 0,
        engagementObservationByOriginalDayEndCount: 0,
      }) },
      preparation: preparationDependencies().preparation,
      clock: () => now,
    });
    const [unrebuildable] = await missingPosts.prepare({
      dates: [date],
      batchSize: 1,
      timestampPolicy: "published_at",
    });
    expect(unrebuildable).toMatchObject({
      status: "unrebuildable",
      reason: "no_visible_feed_rows",
      authoritativeInputDigest: null,
    });

    const dependencies = preparationDependencies();
    const missingProof = new ReaderSummaryPromotionV2HistoricalPreparation({
      authority: dependencies.authority,
      preparation: {
        ...dependencies.preparation,
        readActiveSource: async () => null,
      },
      clock: () => now,
    });
    const [pending] = await missingProof.prepare({
      dates: [date],
      batchSize: 1,
      timestampPolicy: "published_at",
    });
    expect(pending).toMatchObject({
      status: "pending",
      reason: "active_daily_publication_or_proof_missing",
      authoritativeInputDigest: null,
    });
  });

  it("scopes the active-publication preparation read for production RLS", async () => {
    const observedAccess: unknown[] = [];
    const source = await new PostgresHistoricalPromotionPreparationReader(
      {
        $queryRaw: jest.fn(async () => {
          observedAccess.push(currentDatabaseAccess());
          return [{
            publicationId: "00000000-0000-4000-8000-000000000301",
            artifactId: "00000000-0000-4000-8000-000000000302",
            reportSha256: "a".repeat(64),
            proofSha256: "b".repeat(64),
          }];
        }) as never,
      },
      readerSummaryProductionDayScope,
    ).readActiveSource(date);

    expect(source).not.toBeNull();
    expect(observedAccess).toEqual([{
      kind: "tenant",
      ...readerSummaryProductionDayScope,
    }]);
  });
});

const preparationDependencies = () => ({
  authority: { inspect: async () => inspection() },
  preparation: {
    readActiveSource: async () => ({
      publicationId: "00000000-0000-4000-8000-000000000301",
      artifactId: "00000000-0000-4000-8000-000000000302",
      reportSha256: "a".repeat(64),
      proofSha256: "b".repeat(64),
    }),
    captureDataset: async () => buildReaderSummaryDayDatasetManifest({
      tenantId: readerSummaryProductionDayScope.tenantId,
      workspaceId: readerSummaryProductionDayScope.workspaceId,
      startedAt: new Date(`${date}T00:00:00.000Z`),
      endedAt: new Date("2026-08-02T00:00:00.000Z"),
      generatedAt: new Date("2026-08-31T11:55:00.000Z"),
      feedRows: [{ providerKey: "reddit", rowJson: '{"feed":"reddit-1"}' }],
      eligibilityRows: [],
    }),
  },
});

const inspection = () => ({
  rows: [{
    feedItemId: "reddit-1",
    providerKey: "reddit",
    providerMetadata: { kind: "reddit_post", score: 80, upvoteRatio: 0.9 },
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
  }],
  engagementSnapshotCount: 1,
  engagementObservationByOriginalDayEndCount: 1,
});

const classification = () => ({
  kind: "exact-replayable" as const,
  reason: "complete_authority_observed_by_original_day_end" as const,
  authorityInspectionDigest: "c".repeat(64),
  visibleFeedRowCount: 1,
  promotionRelevantRowCount: 1,
  structurallyValidRowCount: 1,
  structurallyValidByOriginalDayEndCount: 1,
  engagementSnapshotCount: 1,
  engagementObservationByOriginalDayEndCount: 1,
  providerCounts: { reddit: 1 },
  providerLimitations: [],
});

const verifiedOutput = () => ({
  jobId: "00000000-0000-4000-8000-000000000310",
  artifactId: "00000000-0000-4000-8000-000000000311",
  publicationId: "00000000-0000-4000-8000-000000000311",
  previousPublicationId: "00000000-0000-4000-8000-000000000301",
  reportSha256: "d".repeat(64),
  proofSha256: "e".repeat(64),
  selectedCounts: { top: 8, additional: 4, citations: 12 },
  qualityGates: {
    promotionV2Attested: true as const,
    citationsVerified: true as const,
    publicationProofVerified: true as const,
    apiVisibilityVerified: true as const,
  },
});
