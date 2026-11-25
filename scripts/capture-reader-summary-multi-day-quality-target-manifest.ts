import { Pool } from "pg";

import { loadDotenvIfPresent } from "./lib/env-file";
import { assertPrivateCorpusOutputOutsideGitWorktree } from "./lib/reader-summary-multi-day-corpus-security";
import { readCurrentPublicArtifactSnapshot } from "./lib/reader-summary-current-publication-bindings";
import type { TargetManifestV4 } from "./lib/reader-summary-multi-day-target-manifest";
import { canonicalJsonSha256 } from "./lib/reader-summary-quality-eval-support";
import { writePrivateJsonAtomically } from "./lib/private-json-artifact";
import { yesterdaySocialQualityDatabaseUrl } from "./lib/yesterday-social-replay-support";

type CaptureTargetManifestOptions = {
  readonly dates: readonly string[];
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeKey: "workspace";
  readonly outputPath: string;
};

const valueOptions = new Set([
  "--date",
  "--tenant-id",
  "--workspace-id",
  "--out",
]);

export function parseCaptureTargetManifestOptions(
  args: readonly string[],
): CaptureTargetManifestOptions {
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      option === undefined ||
      !valueOptions.has(option) ||
      value === undefined ||
      value.startsWith("--") ||
      value.trim().length === 0
    ) {
      throw new Error(`Invalid capture argument: ${option ?? "<missing>"}`);
    }
    values.set(option, [...(values.get(option) ?? []), value.trim()]);
  }
  const dates = values.get("--date") ?? [];
  if (dates.length < 5 || new Set(dates).size !== dates.length) {
    throw new Error("At least five distinct --date values are required");
  }
  const sortedDates = [...dates].sort();
  for (const date of sortedDates) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
    ) {
      throw new Error(`Invalid UTC collection date: ${date}`);
    }
  }
  const tenantId = singleValue(values, "--tenant-id");
  const workspaceId = singleValue(values, "--workspace-id");
  const outputPath = singleValue(values, "--out");
  if (!isUuid(tenantId) || !isUuid(workspaceId)) {
    throw new Error("Tenant and workspace identifiers must be UUIDs");
  }
  return {
    dates: sortedDates,
    tenantId,
    workspaceId,
    scopeKey: "workspace",
    outputPath,
  };
}

export async function captureTargetManifest(params: {
  readonly options: CaptureTargetManifestOptions;
  readonly databaseUrl: string;
}): Promise<TargetManifestV4> {
  const pool = new Pool({
    connectionString: params.databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const snapshot = await readCurrentPublicArtifactSnapshot({
      pool,
      databaseUrl: params.databaseUrl,
      scope: {
        tenantId: params.options.tenantId,
        workspaceId: params.options.workspaceId,
        scopeType: "workspace",
        scopeKey: params.options.scopeKey,
      },
      collectionDates: params.options.dates,
    });
    return {
      schemaVersion: 4,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4",
      databaseFingerprint: snapshot.databaseFingerprint,
      capturedAt: snapshot.capturedAt,
      currentAtCapture: true,
      generationProfile: snapshot.generationProfile,
      scope: {
        tenantId: params.options.tenantId,
        workspaceId: params.options.workspaceId,
        scopeType: "workspace",
        scopeKey: params.options.scopeKey,
      },
      targets: snapshot.targets,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  loadDotenvIfPresent(".env");
  const options = parseCaptureTargetManifestOptions(process.argv.slice(2));
  assertPrivateCorpusOutputOutsideGitWorktree(options.outputPath);
  const manifest = await captureTargetManifest({
    options,
    databaseUrl: yesterdaySocialQualityDatabaseUrl(),
  });
  writePrivateJsonAtomically({
    path: options.outputPath,
    value: manifest,
    replace: false,
  });
  console.log(
    `Manual captured-current target manifest written: capturedAt=${manifest.capturedAt} days=${manifest.targets.length} hash=${canonicalJsonSha256(manifest)}; CI and release status are not asserted`,
  );
}

function singleValue(values: ReadonlyMap<string, string[]>, name: string): string {
  const entries = values.get(name) ?? [];
  if (entries.length !== 1 || entries[0] === undefined) {
    throw new Error(`${name} must be provided exactly once`);
  }
  return entries[0];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Target manifest capture failed",
    );
    process.exitCode = 1;
  });
}
