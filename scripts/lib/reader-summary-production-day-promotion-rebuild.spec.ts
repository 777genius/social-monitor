import { historicalPromotionRebuildIdentity } from
  "./reader-summary-promotion-v2-historical-classification";
import {
  assertProductionDayPromotionRetrySafe,
  productionDayPromotionRebuildEnvironment,
  resolveProductionDayPromotionRebuild,
} from "./reader-summary-production-day-promotion-rebuild";
import { resolveProductionDayExecutionRequest } from
  "./reader-summary-production-day-reuse-provenance";

const date = "2026-08-01";
const authoritativeInputDigest = "1".repeat(64);
const promotionRebuild = {
  rebuildIdentity: historicalPromotionRebuildIdentity({
    date,
    authoritativeInputDigest,
  }),
  authoritativeInputDigest,
  policyVersion: "reader_post_promotion.v2" as const,
  sourcePublicationId: "00000000-0000-4000-8000-000000000101",
  sourceArtifactId: "00000000-0000-4000-8000-000000000102",
  sourcePublicationProofSha256: "2".repeat(64),
};

describe("production-day Promotion V2 rebuild seam", () => {
  it("requires a complete hash-bound authority only in historical recovery", () => {
    const env = productionDayPromotionRebuildEnvironment(promotionRebuild);

    expect(resolveProductionDayPromotionRebuild({
      env,
      recoveryActive: true,
      date,
    })).toEqual(promotionRebuild);
    expect(() => resolveProductionDayPromotionRebuild({
      env,
      recoveryActive: false,
      date,
    })).toThrow("requires complete historical recovery authority");
    expect(() => resolveProductionDayPromotionRebuild({
      env: { ...env, DURABLE_READER_SUMMARY_SOURCE_ARTIFACT_ID: "" },
      recoveryActive: true,
      date,
    })).toThrow("requires complete historical recovery authority");
  });

  it("returns no authority when promotion rebuild is not requested", () => {
    expect(resolveProductionDayPromotionRebuild({
      env: {},
      recoveryActive: true,
      date,
    })).toBeUndefined();
  });

  it("never re-enters an uncertain durable model operation", () => {
    expect(() => assertProductionDayPromotionRetrySafe({
      created: false,
      status: "running",
    })).toThrow("requires reconciliation before retry");
    expect(() => assertProductionDayPromotionRetrySafe({
      created: false,
      status: "quality_rejected",
    })).toThrow("requires reconciliation before retry");
    expect(() => assertProductionDayPromotionRetrySafe({
      created: false,
      status: "completed",
    })).not.toThrow();
    expect(() => assertProductionDayPromotionRetrySafe({
      created: true,
      status: "requested",
    })).not.toThrow();
  });

  it("admits the rebuild authority only on fresh historical regeneration", () => {
    const request = resolveProductionDayExecutionRequest([
      ...regenerationArguments(),
      "--promotion-v2-rebuild",
      "--promotion-rebuild-identity", promotionRebuild.rebuildIdentity,
      "--authoritative-input-sha256", authoritativeInputDigest,
      "--source-publication-id", promotionRebuild.sourcePublicationId,
      "--source-artifact-id", promotionRebuild.sourceArtifactId,
      "--source-publication-proof-sha256",
      promotionRebuild.sourcePublicationProofSha256,
    ]);

    expect(request).toMatchObject({
      mode: "historical-regeneration",
      promotionRebuild,
    });
    expect(() => resolveProductionDayExecutionRequest([
      ...regenerationArguments(),
      "--promotion-rebuild-identity", promotionRebuild.rebuildIdentity,
    ])).toThrow("requires --promotion-v2-rebuild");
  });
});

const regenerationArguments = (): readonly string[] => [
  "--regenerate-after-passed-collection",
  "--reuse-source-report", "/evidence/source.json",
  "--reuse-source-artifact-sha256", "a".repeat(64),
  "--reuse-collection-artifact", "/evidence/collection.json",
  "--reuse-collection-artifact-sha256", "b".repeat(64),
  "--reuse-collection-quality-report", "/evidence/quality.json",
  "--reuse-collection-quality-report-sha256", "c".repeat(64),
  "--reuse-dataset-manifest", "/evidence/dataset.json",
  "--reuse-dataset-manifest-sha256", "d".repeat(64),
  "--recovery-timestamp-policy", "published_at",
];
