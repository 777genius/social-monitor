import { readFileSync } from "node:fs";
import { ReaderSummaryArtifact, evaluateReaderSummaryTopicMapStructure } from "@social-monitor/summary/domain";
import { normalizeReaderSummaryArtifactPayload } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-payload";
import { serializeReaderSummaryArtifact } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-json";
import { canonicalizeReaderSummaryWeeklyJson } from
  "@social-monitor/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { dailyPublicationReport, jsonStructure, largeDailyPublicationFixture } from
  "./reader-summary-large-daily-publication-fixture";
import { sha256, stableJson } from "./reader-summary-weekly-publication-evidence-postgres-contract";

describe("large synthetic daily V2 publication", () => {
  it("uses production builders for 8+8 cards within every unchanged daily bound", () => {
    const { artifact, payload } = largeDailyPublicationFixture();
    const snapshot = artifact.toSnapshot();
    expect(snapshot.content?.topReads).toHaveLength(8);
    expect(snapshot.content?.selectedPosts).toHaveLength(8);
    expect(snapshot.promotionAttestations).toHaveLength(16);
    expect(evaluateReaderSummaryTopicMapStructure(snapshot.content!.topicMap!)).toMatchObject({
      passed: true, metrics: { semanticGroupCount: 2, groupedCoverage: 1 },
    });
    const report = dailyPublicationReport(payload);
    const structure = jsonStructure(report);
    expect(structure.maxString).toBeGreaterThan(40_000);
    expect(Buffer.byteLength(stableJson(report))).toBeGreaterThan(1_700_000);
    expect(Buffer.byteLength(stableJson(report))).toBeLessThanOrEqual(4_194_304);
    for (const [key, bound] of Object.entries({ nodes: 25000, depth: 32, keys: 20000,
      objectKeys: 128, arrayElements: 20000, maxArray: 1024, maxString: 65536 })) {
      expect(structure[key as keyof typeof structure]).toBeLessThanOrEqual(bound);
    }
    expect(() => canonicalizeReaderSummaryWeeklyJson(report)).toThrow();
    const restored = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(payload, {
      id: snapshot.readerSummaryId, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
      scopeType: "workspace", interestId: null, cadence: "daily",
      periodStartedAt: snapshot.period.startedAt, periodEndedAt: snapshot.period.endedAt,
      periodTimezone: "UTC", userId: null, subscriptionId: null,
      headline: snapshot.headline, summaryText: snapshot.executiveSummary,
      createdAt: snapshot.generatedAt!,
    }));
    expect(stableJson(serializeReaderSummaryArtifact(restored)) === stableJson(payload)).toBe(true);
    for (const attestation of snapshot.promotionAttestations!) {
      expect(sha256(attestation.canonicalPayload)).toBe(attestation.digest);
    }
    expect(sha256(stableJson(report))).toBe(sha256(stableJson(dailyPublicationReport(
      serializeReaderSummaryArtifact(restored),
    ))));
  });

  it("replaces only the UTF16 counter, preserving the canonical writer and bound profiles", () => {
    const migration = readFileSync(
      "prisma/migrations/20260905160000_reader_summary_linear_utf16_length/migration.sql", "utf8");
    expect(migration.match(/CREATE OR REPLACE FUNCTION\s+(\S+)/gu)).toEqual([
      "CREATE OR REPLACE FUNCTION public.reader_summary_weekly_utf16_length(value",
    ]);
    expect(migration).toContain('regexp_count(value COLLATE "C", U&\'[\\+010000-\\+10FFFF]\')');
    expect(migration).toContain("IMMUTABLE STRICT PARALLEL SAFE");
    expect(migration).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(migration).not.toMatch(/UPDATE|ALTER FUNCTION|REVOKE.*FUNCTION|GRANT.*FUNCTION/u);
  });
});
