import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import { parse } from "pg-connection-string";
import { resolvePostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { verifyHistoricalPromotionArtifact } from "./reader-summary-promotion-v2-historical-artifact";
import { fixturePriorPayload, fixtureDate, fixturePriorTime, fixtureId, fixtureMetadata } from "./reader-summary-successor-fixture-seed";
import { assertFixtureTarget, type FixtureMarker } from "./reader-summary-successor-fixture-safety";
import { refreshBytesHash, refreshScope } from "./reader-summary-new-input-refresh-manifest";

const marker: FixtureMarker = { format: "reader-summary-successor-disposable-cluster-v1", disposable: true,
  database: "reader_summary_refresh_test_pure", dataDirectory: "/tmp/successor-pure/data",
  socketDirectory: "/tmp/successor-pure/socket", port: 55432, systemIdentifier: "123456789" };
const url = "postgresql://successor_fixture@localhost:55432/reader_summary_refresh_test_pure?host=%2Ftmp%2Fsuccessor-pure%2Fsocket";

describe("successor fixture without database access", () => {
  it("builds deterministic canonical no-signal prior through the domain and publication proof", () => {
    const first = fixturePriorPayload().payload, second = fixturePriorPayload().payload;
    expect(first).toEqual(second);
    expect(first.reportSha256).toBe(refreshBytesHash(Buffer.from(first.reportCanonical)));
    expect(first.proofSha256).toBe(refreshBytesHash(Buffer.from(first.proofCanonical)));
    expect(verifyHistoricalPromotionArtifact({ artifactId: fixtureId(2), status: "NO_SIGNAL", ...refreshScope,
      scopeType: "workspace", interestId: null, cadence: "daily", periodStartedAt: `${fixtureDate}T00:00:00.000Z`,
      periodEndedAt: fixturePriorTime, periodTimezone: "UTC", userId: null, subscriptionId: null,
      headline: String(first.report.headline), summaryText: String(first.report.summaryText),
      createdAt: fixturePriorTime, artifactPayload: first.report.artifactPayload,
    })).toEqual({ kind: "valid-no-signal", noSignal: true, rankingPolicyVersion: "story_ranking_v10",
      orderedLanes: { top: [], additional: [] }, citationCount: 0 });
  });
  it("has actual canonical feed eligibility for the fabricated story", () => {
    expect(classifyFeedPromotionEligibility({ providerKey: "hacker-news", providerMetadata: fixtureMetadata }).eligible).toBe(true);
  });
  it("uses the socket for node-postgres and resolves the real bounded runtime pool", () => {
    expect(assertFixtureTarget(url, marker).pathname).toBe(`/${marker.database}`);
    expect(parse(url).host).toBe(marker.socketDirectory);
    const config = resolvePostgresRuntimePoolConfig({ DATABASE_URL: url, POSTGRES_RUNTIME_PROCESS: "daily-runner",
      POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" });
    expect(config).toMatchObject({ max: 2 });
  });
  it.each([
    url.replace("reader_summary_refresh_test_pure", "production"),
    url.replace("localhost", "203.0.113.10"),
    url.replace("successor_fixture@", "successor_fixture:secret@"),
    url.replace("?host=%2Ftmp%2Fsuccessor-pure%2Fsocket", ""),
    `${url}&host=%2Ftmp%2Fother`, `${url}&sslmode=disable`, `${url}#ignored`,
    url.replace("55432", "543"),
  ])("rejects unsafe target before opening any connection: %s", value => {
    expect(() => assertFixtureTarget(value, marker)).toThrow();
  });
  it("requires an explicit matching disposable-cluster attestation", () => {
    expect(() => assertFixtureTarget(url, { ...marker, disposable: false } as unknown as FixtureMarker)).toThrow();
    expect(() => assertFixtureTarget(url, { ...marker, socketDirectory: "/var/run/postgresql" })).toThrow();
    expect(() => assertFixtureTarget(url, { ...marker, database: "reader_summary_refresh_test_other" })).toThrow();
  });
});
