import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadHistoricalRegeneration } from "./reader-summary-production-day-regeneration";
import { sha256Hex } from "./reader-summary-production-day-provenance";
import type { ProductionDayExecutionRequest } from "./reader-summary-production-day-reuse-provenance";
import { buildReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";

const tenantId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-20T00:10:00.000Z");

const collectionDate = "2026-07-19";
const omissionReason =
  "The exact end-of-day GitHub projection is unavailable for this completed UTC day.";

describe("historical production-day regeneration", () => {
  let directory = "";

  afterEach(() => {
    if (directory.length > 0) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts a new eight-step summary failure without daily migration", () => {
    const request = writeFixtures();

    const result = loadHistoricalRegeneration(loadParams(request));

    expect(result.verifiedCollectionStep).toMatchObject({
      id: "collect",
      status: "passed",
      exitCode: 0,
    });
    expect(result.provenance).toMatchObject({
      mode: "historical-regeneration",
      timestampPolicy: "published_at",
      requestedUtcPeriod: {
        startedAt: "2026-07-19T00:00:00.000Z",
        endedAt: "2026-07-20T00:00:00.000Z",
      },
      githubPolicy: {
        mode: "verified_collected_rows",
        collectedRowCount: 20,
      },
    });
  });

  it("fails closed when any approved content hash differs", () => {
    const request = writeFixtures();

    expect(() =>
      loadHistoricalRegeneration(
        loadParams({
          ...request,
          collectionArtifactSha256: "0".repeat(64),
        }),
      ),
    ).toThrow("source collection artifact content hash does not match");
  });

  it("rejects a source attempt whose collection step did not pass", () => {
    const request = writeFixtures({ collectStatus: "failed" });

    expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
      "Source production attempt did not pass collect",
    );
  });

  it.each(["collect", "collection-quality"] as const)(
    "rejects a new source attempt missing required step %s",
    (missingStep) => {
      const request = writeFixtures({ missingStep });

      expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
        `Source production attempt did not pass ${missingStep}`,
      );
    },
  );

  it("rejects a new source attempt missing a downstream required step", () => {
    const request = writeFixtures({ missingStep: "artifact-quality" });

    expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
      "Source production attempt has an invalid step inventory",
    );
  });

  it("accepts a legacy source attempt with a passed daily migration", () => {
    const request = writeFixtures({ legacyMigrateStatus: "passed" });

    expect(
      loadHistoricalRegeneration(loadParams(request)).verifiedCollectionStep,
    ).toMatchObject({ id: "collect", status: "passed", exitCode: 0 });
  });

  it("rejects a legacy source attempt whose daily migration failed", () => {
    const request = writeFixtures({ legacyMigrateStatus: "failed" });

    expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
      "Source production attempt did not pass migrate",
    );
  });

  it("rejects collection evidence from another UTC day", () => {
    const request = writeFixtures({ collectionDate: "2026-07-18" });

    expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
      "Source production attempt is not a strict failed run",
    );
  });

  it("rejects provider counts that disagree across collection evidence", () => {
    const request = writeFixtures({ qualityXCount: 89 });

    expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
      "Collection provider counts do not match quality evidence",
    );
  });

  it("requires a safe explicit GitHub omission reason", () => {
    const request = writeFixtures({
      timestampPolicy: "observed_at",
      githubCount: 0,
      allowHistoricalGitHubOmission: true,
    });

    expect(() =>
      loadHistoricalRegeneration({
        ...loadParams(request),
        githubOmissionReason: "too short",
      }),
    ).toThrow("GitHub0 requires one safe explicit historical_unavailable");
  });

  it("allows GitHub0 only with explicit historical_unavailable policy", () => {
    const request = writeFixtures({
      timestampPolicy: "observed_at",
      githubCount: 0,
      allowHistoricalGitHubOmission: true,
    });

    expect(
      loadHistoricalRegeneration(loadParams(request)).provenance.githubPolicy,
    ).toEqual({
      mode: "historical_unavailable",
      reason: omissionReason,
      collectedRowCount: 0,
    });
  });

  it("rejects omission when the exact-day dataset contains GitHub rows", () => {
    const request = writeFixtures({ allowHistoricalGitHubOmission: true });

    expect(() => loadHistoricalRegeneration(loadParams(request))).toThrow(
      "Historical GitHub omission is forbidden when collected GitHub rows exist",
    );
  });

  function writeFixtures(
    options: {
      readonly collectionDate?: string;
      readonly collectStatus?: "passed" | "failed";
      readonly missingStep?:
        | "collect"
        | "collection-quality"
        | "artifact-quality";
      readonly legacyMigrateStatus?: "passed" | "failed";
      readonly qualityXCount?: number;
      readonly timestampPolicy?: "published_at" | "observed_at";
      readonly githubCount?: number;
      readonly allowHistoricalGitHubOmission?: boolean;
    } = {},
  ): Extract<
    ProductionDayExecutionRequest,
    { readonly mode: "historical-regeneration" }
  > {
    directory = mkdtempSync(join(tmpdir(), "summary-regeneration-"));
    const fixtureDate = options.collectionDate ?? collectionDate;
    const sourceReportPath = join(directory, "source-report.json");
    const collectionArtifactPath = join(directory, "collection.json");
    const collectionQualityReportPath = join(directory, "quality.json");
    const datasetManifestPath = join(directory, "dataset-manifest.json");
    const providerCounts = {
      "github-trending-page": options.githubCount ?? 20,
      "hacker-news": 82,
      reddit: 161,
      rss: 72,
      "x-twitter": 90,
    };

    writeJson(sourceReportPath, {
      schemaVersion: 1,
      artifactFormat: "reader-summary-production-day-run-v1",
      generatedBy: "npm run run:reader-summary-production-day",
      requestedDate: fixtureDate,
      collectionDate: fixtureDate,
      blockingPassed: false,
      model: {
        liveCollection: true,
        allowDegraded: false,
        allowHistorical: false,
      },
      steps: sourceAttemptSteps(options),
    });
    writeJson(collectionArtifactPath, {
      schemaVersion: 1,
      artifactFormat: "reader-summary-clean-real-day-collection-v1",
      generatedBy: "npm run run:reader-summary-clean-real-day-collection",
      blockingPassed: true,
      qualityGates: { collectionPassed: true },
      run: { collectionDate: fixtureDate },
      inputs: {
        targetPublishedWindow: {
          startInclusive: `${fixtureDate}T00:00:00.000Z`,
          endExclusive:
            fixtureDate === "2026-07-19"
              ? "2026-07-20T00:00:00.000Z"
              : "2026-07-19T00:00:00.000Z",
        },
      },
      targetWindow: { providerCounts },
      scans: Object.keys(providerCounts).map((providerKey) => ({
        providerKey,
        status: "succeeded",
      })),
    });
    writeJson(collectionQualityReportPath, {
      schemaVersion: 1,
      artifactFormat: "yesterday-social-collection-quality-report-v1",
      generatedBy: "npm run check:yesterday-social-collection-quality",
      collectionDate: fixtureDate,
      collectionBlockingPassed: true,
      qualityGates: { qualityPassed: true },
      dayWindowAudit: {
        providerBreakdown: Object.entries(providerCounts).map(
          ([providerKey, count]) => ({
            providerKey,
            publishedInsideWindowFeedItemCount:
              providerKey === "x-twitter"
                ? (options.qualityXCount ?? count)
                : count,
          }),
        ),
      },
    });
    writeJson(
      datasetManifestPath,
      buildReaderSummaryDayDatasetManifest({
        tenantId,
        workspaceId,
        startedAt: new Date(`${fixtureDate}T00:00:00.000Z`),
        endedAt: new Date(
          fixtureDate === "2026-07-19"
            ? "2026-07-20T00:00:00.000Z"
            : "2026-07-19T00:00:00.000Z",
        ),
        generatedAt: new Date("2026-07-20T00:05:00.000Z"),
        timestampPolicy: options.timestampPolicy,
        feedRows: Object.entries(providerCounts).flatMap(
          ([providerKey, count]) =>
            Array.from({ length: count }, (_, index) => ({
              providerKey,
              rowJson: `${providerKey}:${index}`,
            })),
        ),
        eligibilityRows: [{ rowJson: "github-binding" }],
      }),
    );
    for (const path of [
      sourceReportPath,
      collectionArtifactPath,
      collectionQualityReportPath,
      datasetManifestPath,
    ]) {
      chmodSync(path, 0o400);
    }

    return {
      mode: "historical-regeneration",
      sourceReportPath,
      sourceReportSha256: digest(sourceReportPath),
      collectionArtifactPath,
      collectionArtifactSha256: digest(collectionArtifactPath),
      collectionQualityReportPath,
      collectionQualityReportSha256: digest(collectionQualityReportPath),
      datasetManifestPath,
      datasetManifestSha256: digest(datasetManifestPath),
      timestampPolicy: options.timestampPolicy ?? "published_at",
      allowHistoricalGitHubOmission:
        options.allowHistoricalGitHubOmission ?? false,
    };
  }
});

function loadParams(
  request: Extract<
    ProductionDayExecutionRequest,
    { readonly mode: "historical-regeneration" }
  >,
) {
  return {
    request,
    collectionDate,
    githubOmissionReason: request.allowHistoricalGitHubOmission
      ? omissionReason
      : undefined,
    recoveryRoot: directoryFor(request.sourceReportPath),
    forbiddenOutputPaths: [],
    tenantId,
    workspaceId,
    now,
  };
}

function directoryFor(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function passedStep(id: string) {
  return {
    id,
    command: `npm run ${id}`,
    status: "passed",
    durationMs: 1,
    exitCode: 0,
  };
}

function failedStep(id: string) {
  return {
    ...passedStep(id),
    status: "failed",
    exitCode: 1,
  };
}

function sourceAttemptSteps(options: {
  readonly collectStatus?: "passed" | "failed";
  readonly missingStep?:
    | "collect"
    | "collection-quality"
    | "artifact-quality";
  readonly legacyMigrateStatus?: "passed" | "failed";
}) {
  const currentSteps = [
    options.collectStatus === "failed"
      ? failedStep("collect")
      : passedStep("collect"),
    passedStep("collection-quality"),
    failedStep("durable-reader-summary"),
    failedStep("artifact-quality"),
    failedStep("quality-dashboard"),
    failedStep("top-read-ranking"),
    failedStep("source-quality-trace"),
    failedStep("clean-day-e2e"),
  ].filter((step) => step.id !== options.missingStep);
  if (options.legacyMigrateStatus === undefined) {
    return currentSteps;
  }
  return [
    options.legacyMigrateStatus === "passed"
      ? passedStep("migrate")
      : failedStep("migrate"),
    ...currentSteps,
  ];
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function digest(path: string): string {
  return sha256Hex(readFileSync(path));
}
