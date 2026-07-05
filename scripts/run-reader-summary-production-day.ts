import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { Pool } from "pg";

import {
  nextDate,
  noRawSecretFragments,
  readOption,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

type StepStatus = "passed" | "failed" | "skipped";

type StepReport = {
  readonly id: string;
  readonly command: string;
  readonly status: StepStatus;
  readonly durationMs: number;
  readonly exitCode: number | null;
};

type ProductionDayReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-production-day-run-v1";
  readonly generatedBy: string;
  readonly collectionDate: string;
  readonly model: {
    readonly liveCollection: boolean;
    readonly summaryModel: "agent-runtime" | "openai-responses" | "deterministic";
    readonly writesProductionData: true;
    readonly allowDegraded: boolean;
    readonly allowHistorical: boolean;
    readonly rawProviderPayloadPersistedInReport: false;
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly periodStartedAt: string;
    readonly periodEndedAt: string;
    readonly tenantFingerprint: string | null;
    readonly workspaceFingerprint: string | null;
    readonly evidencePath: string;
    readonly frontendFixturePath: string;
  };
  readonly run: {
    readonly startedAt: string;
    readonly completedAt: string;
  };
  readonly steps: readonly StepReport[];
  readonly stats: {
    readonly collectedFeedItemCount: number | null;
    readonly publishedInsideWindowFeedItemCount: number | null;
    readonly observedButPublishedOutsideWindowFeedItemCount: number | null;
    readonly duplicateFeedItemCount: number | null;
    readonly lowRelevanceFeedItemCount: number | null;
    readonly summaryCandidateFeedItemCount: number | null;
    readonly selectedFeedItemCount: number | null;
    readonly topReadCount: number | null;
    readonly providerCounts: Record<string, number>;
    readonly xAccountCount: number | null;
    readonly xAccountUsageEventCount: number | null;
    readonly xAccounts: readonly {
      readonly accountFingerprint: string;
      readonly priorityRank: number;
      readonly dailyRequests: number;
      readonly dailyTweets: number;
      readonly passSucceededCount: number;
      readonly passFailedCount: number;
      readonly rateLimitCount: number;
      readonly cooldownObservedCount: number;
      readonly lastUsedAt: string | null;
      readonly cooldownUntil: string | null;
    }[];
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const outputPath = "ops/evals/reader-summary-production-day-run.v1.json";
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const skipLiveCollection = process.argv.includes("--skip-live-collection");
const allowDegraded = process.argv.includes("--allow-degraded");
const allowHistorical = process.argv.includes("--allow-historical");
const collectionDate = artifactOnly ? "1970-01-01" : resolveCollectionDate();
const summaryModel = resolveSummaryModel();
const periodStartedAt = `${collectionDate}T00:00:00.000Z`;
const periodEndedAt = nextDate(collectionDate);
const runtimeArtifactDirectory = resolve(
  process.env.READER_SUMMARY_PRODUCTION_DAY_ARTIFACT_DIR ??
    join(
      tmpdir(),
      "social-monitor",
      "reader-summary-production-day",
      collectionDate,
    ),
);
const evidencePath = join(
  runtimeArtifactDirectory,
  `durable-reader-summary-${collectionDate}.v1.json`,
);
const frontendFixturePath = join(
  runtimeArtifactDirectory,
  `frontend-reader-summary-${collectionDate}.fixture.v1.json`,
);

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const startedAt = new Date();
  const steps: StepReport[] = [];

  steps.push(runNpm("migrate", ["run", "migrate:deploy"]));
  const scope = await readDominantPublishedScope();

  if (skipLiveCollection) {
    steps.push({
      id: "collect",
      command: "npm run run:reader-summary-clean-real-day-collection -- skipped",
      status: "skipped",
      durationMs: 0,
      exitCode: null,
    });
  } else {
    steps.push(
      runNpm("collect", [
        "run",
        "run:reader-summary-clean-real-day-collection",
        "--",
        "--update",
      ]),
    );
  }

  mkdirSync(runtimeArtifactDirectory, { recursive: true });
  rmSync(evidencePath, { force: true });
  rmSync(frontendFixturePath, { force: true });

  steps.push(
    runNpm("collection-quality", [
      "run",
      "check:yesterday-social-collection-quality",
      "--",
      "--update",
      "--date",
      collectionDate,
      "--write-failed-report",
    ]),
  );

  steps.push(
    runNpm(
      "durable-reader-summary",
      ["run", "capture:durable-reader-summary"],
      {
        DATABASE_URL: yesterdaySocialQualityDatabaseUrl(),
        DURABLE_READER_SUMMARY_MODEL: summaryModel,
        DURABLE_READER_SUMMARY_TENANT_ID: scope.tenantId,
        DURABLE_READER_SUMMARY_WORKSPACE_ID: scope.workspaceId,
        DURABLE_READER_SUMMARY_CADENCE: "daily",
        DURABLE_READER_SUMMARY_PERIOD_STARTED_AT: periodStartedAt,
        DURABLE_READER_SUMMARY_PERIOD_ENDED_AT: periodEndedAt,
        DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS: "120",
        DURABLE_READER_SUMMARY_MAX_STORIES: "15",
        DURABLE_READER_SUMMARY_EVIDENCE_PATH: evidencePath,
        DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH: frontendFixturePath,
      },
    ),
  );

  steps.push(
    runNpm("artifact-quality", [
      "run",
      "check:yesterday-reader-summary-artifact-quality",
      "--",
      "--update",
      "--date",
      collectionDate,
      ...(allowDegraded ? ["--allow-dirty-collection"] : []),
      ...(allowHistorical ? ["--allow-historical"] : []),
    ]),
  );
  steps.push(
    runNpm("quality-dashboard", [
      "run",
      "check:reader-summary-quality-dashboard",
      "--",
      "--update",
      ...(allowDegraded ? ["--allow-degraded"] : []),
      ...(allowHistorical ? ["--allow-historical"] : []),
    ]),
  );
  steps.push(
    runNpm("source-quality-trace", [
      "run",
      "check:reader-summary-source-quality-trace",
      "--",
      "--update",
    ]),
  );
  steps.push(
    runNpm("clean-day-e2e", [
      "run",
      "check:reader-summary-clean-real-day-e2e",
      "--",
      "--update",
      ...(allowDegraded ? ["--allow-degraded"] : []),
      ...(allowHistorical ? ["--allow-historical"] : []),
    ]),
  );

  const completedAt = new Date();
  const report = buildReport({
    startedAt,
    completedAt,
    steps,
    scope,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);

  if (update) {
    console.log(`Updated ${outputPath}`);
  }
  printStats(report);

  if (!report.blockingPassed) {
    throw new Error("Reader summary production day run gates failed");
  }
}

function runNpm(
  id: string,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): StepReport {
  const startedAt = Date.now();
  const result = spawnSync("npm", [...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });

  return {
    id,
    command: `npm ${args.join(" ")}`,
    status: result.status === 0 ? "passed" : "failed",
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
  };
}

function buildReport(params: {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly steps: readonly StepReport[];
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
}): ProductionDayReport {
  const collectionQuality = readJsonIfExists<{
    readonly dayWindowAudit?: {
      readonly observedInsideWindowFeedItemCount?: number;
      readonly publishedInsideWindowFeedItemCount?: number;
      readonly observedButPublishedOutsideWindowFeedItemCount?: number;
      readonly duplicateFeedItemCount?: number;
      readonly lowRelevanceFeedItemCount?: number;
      readonly summaryCandidateFeedItemCount?: number;
      readonly providerBreakdown?: readonly {
        readonly providerKey: string;
        readonly publishedInsideWindowFeedItemCount?: number;
      }[];
    };
    readonly xAccountPool?: {
      readonly accountCount?: number;
      readonly eventCount?: number;
      readonly accounts?: readonly {
        readonly accountFingerprint?: string;
        readonly priorityRank?: number;
        readonly dailyRequests?: number;
        readonly dailyTweets?: number;
        readonly passSucceededCount?: number;
        readonly passFailedCount?: number;
        readonly rateLimitCount?: number;
        readonly cooldownObservedCount?: number;
        readonly lastUsedAt?: string | null;
        readonly cooldownUntil?: string | null;
      }[];
    };
  }>("ops/evals/yesterday-social-collection-quality-report.v1.json");
  const durableEvidence = readJsonIfExists<{
    readonly result?: {
      readonly selectedFeedItemCount?: number;
      readonly topReadCount?: number;
    };
  }>(evidencePath);
  const providerCounts = Object.fromEntries(
    collectionQuality?.dayWindowAudit?.providerBreakdown?.map((provider) => [
      provider.providerKey,
      provider.publishedInsideWindowFeedItemCount ?? 0,
    ]) ?? [],
  );
  const qualityGates = {
    allStepsPassed: params.steps.every(
      (step) => step.status === "passed" || step.status === "skipped",
    ),
    collectionQualityReported:
      collectionQuality?.dayWindowAudit?.publishedInsideWindowFeedItemCount !==
      undefined,
    durableSummaryCaptured:
      durableEvidence?.result?.selectedFeedItemCount !== undefined,
    xAccountPoolReported: collectionQuality?.xAccountPool?.accountCount !==
      undefined,
    noRawSecretFragments: true,
  };
  const reportWithoutSecretGate = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-production-day-run-v1",
    generatedBy: "npm run run:reader-summary-production-day",
    collectionDate,
    model: {
      liveCollection: !skipLiveCollection,
      summaryModel,
      writesProductionData: true,
      allowDegraded,
      allowHistorical,
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
    },
    inputs: {
      periodStartedAt,
      periodEndedAt,
      tenantFingerprint: shortFingerprint(params.scope.tenantId),
      workspaceFingerprint: shortFingerprint(params.scope.workspaceId),
      evidencePath,
      frontendFixturePath,
    },
    run: {
      startedAt: params.startedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
    },
    steps: params.steps,
    stats: {
      collectedFeedItemCount:
        collectionQuality?.dayWindowAudit?.observedInsideWindowFeedItemCount ??
        null,
      publishedInsideWindowFeedItemCount:
        collectionQuality?.dayWindowAudit?.publishedInsideWindowFeedItemCount ??
        null,
      observedButPublishedOutsideWindowFeedItemCount:
        collectionQuality?.dayWindowAudit
          ?.observedButPublishedOutsideWindowFeedItemCount ?? null,
      duplicateFeedItemCount:
        collectionQuality?.dayWindowAudit?.duplicateFeedItemCount ?? null,
      lowRelevanceFeedItemCount:
        collectionQuality?.dayWindowAudit?.lowRelevanceFeedItemCount ?? null,
      summaryCandidateFeedItemCount:
        collectionQuality?.dayWindowAudit?.summaryCandidateFeedItemCount ??
        null,
      selectedFeedItemCount:
        durableEvidence?.result?.selectedFeedItemCount ?? null,
      topReadCount: durableEvidence?.result?.topReadCount ?? null,
      providerCounts,
      xAccountCount: collectionQuality?.xAccountPool?.accountCount ?? null,
      xAccountUsageEventCount: collectionQuality?.xAccountPool?.eventCount ?? null,
      xAccounts:
        collectionQuality?.xAccountPool?.accounts?.flatMap((account) =>
          account.accountFingerprint === undefined ||
          account.priorityRank === undefined
            ? []
            : [
                {
                  accountFingerprint: account.accountFingerprint,
                  priorityRank: account.priorityRank,
                  dailyRequests: account.dailyRequests ?? 0,
                  dailyTweets: account.dailyTweets ?? 0,
                  passSucceededCount: account.passSucceededCount ?? 0,
                  passFailedCount: account.passFailedCount ?? 0,
                  rateLimitCount: account.rateLimitCount ?? 0,
                  cooldownObservedCount: account.cooldownObservedCount ?? 0,
                  lastUsedAt: account.lastUsedAt ?? null,
                  cooldownUntil: account.cooldownUntil ?? null,
                },
              ],
        ) ?? [],
    },
    qualityGates,
    blockingPassed: false,
  } satisfies ProductionDayReport;
  const finalQualityGates = {
    ...qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    qualityGates: finalQualityGates,
    blockingPassed: Object.values(finalQualityGates).every(Boolean),
  };
}

async function readDominantPublishedScope(): Promise<{
  readonly tenantId: string;
  readonly workspaceId: string;
}> {
  const pool = new Pool({
    connectionString: yesterdaySocialQualityDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const result = await pool.query<{
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly itemCount: string;
    }>(
      `
        select
          tenant_id::text as "tenantId",
          workspace_id::text as "workspaceId",
          count(*)::text as "itemCount"
        from feed_items
        where published_at >= $1::timestamptz
          and published_at < $2::timestamptz
        group by tenant_id, workspace_id
        order by count(*) desc
        limit 1
      `,
      [periodStartedAt, periodEndedAt],
    );
    const row = result.rows[0];
    if (row === undefined || Number.parseInt(row.itemCount, 10) === 0) {
      throw new Error(`No published feed items found for ${collectionDate}`);
    }

    return {
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function printStats(report: ProductionDayReport): void {
  console.log(
    [
      `production-day=${report.collectionDate}`,
      `collected=${report.stats.collectedFeedItemCount ?? "n/a"}`,
      `published=${report.stats.publishedInsideWindowFeedItemCount ?? "n/a"}`,
      `outside=${report.stats.observedButPublishedOutsideWindowFeedItemCount ?? "n/a"}`,
      `duplicates=${report.stats.duplicateFeedItemCount ?? "n/a"}`,
      `lowRelevance=${report.stats.lowRelevanceFeedItemCount ?? "n/a"}`,
      `candidates=${report.stats.summaryCandidateFeedItemCount ?? "n/a"}`,
      `selected=${report.stats.selectedFeedItemCount ?? "n/a"}`,
      `topReads=${report.stats.topReadCount ?? "n/a"}`,
      `xAccounts=${report.stats.xAccountCount ?? "n/a"}`,
      `xAccountEvents=${report.stats.xAccountUsageEventCount ?? "n/a"}`,
    ].join(" | "),
  );
  for (const account of report.stats.xAccounts) {
    console.log(
      [
        `xAccount=${account.accountFingerprint}`,
        `priority=${account.priorityRank}`,
        `requests=${account.dailyRequests}`,
        `tweets=${account.dailyTweets}`,
        `success=${account.passSucceededCount}`,
        `failed=${account.passFailedCount}`,
        `rateLimit=${account.rateLimitCount}`,
        `cooldown=${account.cooldownObservedCount}`,
        `lastUsed=${account.lastUsedAt ?? "n/a"}`,
        `cooldownUntil=${account.cooldownUntil ?? "n/a"}`,
      ].join(" | "),
    );
  }
}

function shortFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function resolveCollectionDate(): string {
  const explicit = readOption("--date");
  if (explicit !== undefined) {
    assertCollectionDate(explicit);
    return explicit;
  }
  if (process.argv.includes("--today")) {
    return new Date().toISOString().slice(0, 10);
  }
  if (process.argv.includes("--yesterday")) {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  throw new Error("Provide --date YYYY-MM-DD, --today or --yesterday");
}

function resolveSummaryModel(): ProductionDayReport["model"]["summaryModel"] {
  const value = readOption("--summary-model") ?? "agent-runtime";
  if (
    value === "agent-runtime" ||
    value === "openai-responses" ||
    value === "deterministic"
  ) {
    return value;
  }

  throw new Error(
    "--summary-model must be agent-runtime, openai-responses or deterministic",
  );
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing`);
  }

  const report = readJsonIfExists<ProductionDayReport>(outputPath);
  if (report === null) {
    throw new Error(`${outputPath} is missing`);
  }
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-production-day-run-v1" &&
    report.blockingPassed === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed validation`);
  }

  printStats(report);
}

function readJsonIfExists<TValue>(path: string): TValue | null {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as TValue;
}

function assertCollectionDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Collection date must use YYYY-MM-DD format: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Collection date is invalid: ${value}`);
  }
}
