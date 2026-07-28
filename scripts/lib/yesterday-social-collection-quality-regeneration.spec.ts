import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";
import {
  assertCollectionQualityMatchesRegenerationManifest,
  collectionQualityCountForTimestampPolicy,
  collectionQualityRegenerationFreshnessArgs,
  collectionQualityRowsForTimestampPolicy,
  resolveCollectionQualityRegenerationFreshness,
} from "./yesterday-social-collection-quality-regeneration";

const tenantId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";
const collectionDate = "2026-07-19";

describe("historical regeneration collection-quality freshness", () => {
  let directory = "";

  afterEach(() => {
    if (directory.length > 0) {
      rmSync(directory, { recursive: true, force: true });
      directory = "";
    }
  });

  it("accepts only a fresh hash, scope and UTC-day bound manifest", () => {
    const fixture = writeManifest();
    const freshness = resolve(fixture);

    expect(freshness?.evidence).toMatchObject({
      mode: "historical_regeneration_current_snapshot",
      generalAllowHistorical: false,
      manifestFileSha256: fixture.sha256,
      manifestGeneratedAt: "2026-07-20T00:05:00.000Z",
      timestampPolicy: "published_at",
      maxManifestAgeSeconds: 1800,
    });
    expect(freshness?.evidence.scopeSha256).toHaveLength(64);
  });

  it("fails closed for partial, generic, stale or wrong-scope overrides", () => {
    const fixture = writeManifest();
    const args = freshnessArgs(fixture);

    expect(() =>
      resolveCollectionQualityRegenerationFreshness({
        argv: ["--historical-regeneration-current-snapshot"],
        collectionDate,
        now: new Date("2026-07-20T00:10:00.000Z"),
        update: true,
        allowHistorical: false,
      }),
    ).toThrow("--regeneration-dataset-manifest must be provided exactly once");
    expect(() =>
      resolveCollectionQualityRegenerationFreshness({
        argv: args,
        collectionDate,
        now: new Date("2026-07-20T00:10:00.000Z"),
        update: true,
        allowHistorical: true,
      }),
    ).toThrow("forbids generic --allow-historical");
    for (const invalid of [
      { now: new Date("2026-07-20T00:35:01.000Z") },
      {
        argv: collectionQualityRegenerationFreshnessArgs({
          manifestPath: fixture.path,
          manifestSha256: fixture.sha256,
          tenantId: "55555555-5555-4555-8555-555555555555",
          workspaceId,
          timestampPolicy: "published_at",
        }),
      },
    ]) {
      expect(() =>
        resolveCollectionQualityRegenerationFreshness({
          argv: args,
          collectionDate,
          now: new Date("2026-07-20T00:10:00.000Z"),
          update: true,
          allowHistorical: false,
          ...invalid,
        }),
      ).toThrow("scope, period or freshness is invalid");
    }
  });

  it("binds collection-quality provider counts to the manifest", () => {
    const freshness = resolve(writeManifest());
    expect(freshness).not.toBeNull();
    expect(() =>
      assertCollectionQualityMatchesRegenerationManifest({
        providerCounts: { reddit: 2, "x-twitter": 1 },
        freshness: freshness!,
      }),
    ).not.toThrow();
    expect(() =>
      assertCollectionQualityMatchesRegenerationManifest({
        providerCounts: { reddit: 2, "x-twitter": 2 },
        freshness: freshness!,
      }),
    ).toThrow("provider counts do not match");
  });

  it("uses observed rows and counts only when the bound manifest says observed_at", () => {
    const fixture = writeManifest("observed_at");
    const freshness =
      resolveCollectionQualityRegenerationFreshness({
        argv: freshnessArgs(fixture, "observed_at"),
        collectionDate,
        now: new Date("2026-07-20T00:10:00.000Z"),
        update: true,
        allowHistorical: false,
      });

    expect(
      collectionQualityRowsForTimestampPolicy({
        freshness,
        publishedRows: ["published"],
        observedRows: ["observed"],
      }),
    ).toEqual(["observed"]);
    expect(
      collectionQualityCountForTimestampPolicy({
        freshness,
        publishedCount: 2,
        observedCount: 314,
      }),
    ).toBe(314);
    expect(() =>
      resolveCollectionQualityRegenerationFreshness({
        argv: freshnessArgs(fixture, "published_at"),
        collectionDate,
        now: new Date("2026-07-20T00:10:00.000Z"),
        update: true,
        allowHistorical: false,
      }),
    ).toThrow("scope, period or freshness is invalid");
  });

  function resolve(fixture: {
    readonly path: string;
    readonly sha256: string;
  }) {
    return resolveCollectionQualityRegenerationFreshness({
      argv: freshnessArgs(fixture),
      collectionDate,
      now: new Date("2026-07-20T00:10:00.000Z"),
      update: true,
      allowHistorical: false,
    });
  }

  function freshnessArgs(fixture: {
    readonly path: string;
    readonly sha256: string;
  }, timestampPolicy: "published_at" | "observed_at" = "published_at") {
    return collectionQualityRegenerationFreshnessArgs({
      manifestPath: fixture.path,
      manifestSha256: fixture.sha256,
      tenantId,
      workspaceId,
      timestampPolicy,
    });
  }

  function writeManifest(
    timestampPolicy: "published_at" | "observed_at" = "published_at",
  ): { readonly path: string; readonly sha256: string } {
    directory = mkdtempSync(join(tmpdir(), "collection-quality-manifest-"));
    const path = join(directory, "manifest.json");
    const manifest = buildReaderSummaryDayDatasetManifest({
      tenantId,
      workspaceId,
      startedAt: new Date("2026-07-19T00:00:00.000Z"),
      endedAt: new Date("2026-07-20T00:00:00.000Z"),
      generatedAt: new Date("2026-07-20T00:05:00.000Z"),
      timestampPolicy,
      feedRows: [
        { providerKey: "reddit", rowJson: "reddit:1" },
        { providerKey: "reddit", rowJson: "reddit:2" },
        { providerKey: "x-twitter", rowJson: "x:1" },
      ],
      eligibilityRows: [{ rowJson: "github-binding" }],
    });
    writeFileSync(path, `${JSON.stringify(manifest)}\n`);
    chmodSync(path, 0o400);
    return {
      path,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    };
  }
});
