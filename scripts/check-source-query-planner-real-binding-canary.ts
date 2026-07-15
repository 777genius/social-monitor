import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import {
  fingerprint,
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  asRecord,
  isLocalDataSourceUnavailable,
} from "./lib/reader-summary-quality-eval-support";

type ProviderKey = "reddit" | "x-twitter";

type SourceBindingRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly providerKey: ProviderKey;
  readonly config: unknown;
};

type SourceQueryPlannerRealBindingCanaryReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "source-query-planner-real-binding-canary-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly mode: "real_binding_canary_config";
    readonly liveNetwork: false;
    readonly rawProviderConfigPersistedInReport: false;
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly providerKeys: readonly ProviderKey[];
  };
  readonly totals: {
    readonly bindingCount: number;
    readonly redditBindingCount: number;
    readonly xTwitterBindingCount: number;
  };
  readonly bindings: readonly {
    readonly providerKey: ProviderKey;
    readonly bindingFingerprint: string;
    readonly tenantFingerprint: string;
    readonly workspaceFingerprint: string;
    readonly plannerEnabled: boolean;
    readonly rollout: "real_binding_canary" | "other" | "missing";
    readonly maxLanesPerSource: number | null;
    readonly maxItemsPerLane: number | null;
    readonly maxSearchQueries: number | null;
    readonly includeEnrichment: boolean | null;
    readonly scanPassCount: number;
    readonly searchQueryCount: number;
    readonly searchQueryBudgetCount: number;
  }[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const outputPath = "ops/evals/source-query-planner-real-binding-canary.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const apply = process.argv.includes("--apply");
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const providerKeys: readonly ProviderKey[] = ["reddit", "x-twitter"];

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const report = await tryBuildReport();
  if (report === undefined) {
    if (update || apply) {
      throw new Error(
        "Local source binding data source is unavailable; cannot update source query planner canary report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Source query planner real binding canary gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:source-query-planner-real-binding-canary -- --apply --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:source-query-planner-real-binding-canary -- --update`,
    );
  }

  console.log(
    `Source query planner real binding canary OK (${report.totals.bindingCount} bindings)`,
  );
}

async function tryBuildReport(): Promise<
  SourceQueryPlannerRealBindingCanaryReport | undefined
> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const before = await readPrimaryBindings(pool);
    const appliedUpdateCount = apply
      ? await applyCanaryConfig(pool, before)
      : 0;
    const bindings = apply ? await readPrimaryBindings(pool) : before;
    if (apply) {
      console.log(`Applied ${appliedUpdateCount} source query planner updates`);
    }
    const reportWithoutSecretGate = buildReport(bindings);
    const qualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(Boolean),
    };
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Source query planner real binding canary local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function buildReport(
  bindings: readonly SourceBindingRecord[],
): SourceQueryPlannerRealBindingCanaryReport {
  const rows = bindings.map((binding) => {
    const config = asRecord(binding.config);
    const planner = asRecord(config.sourceQueryPlanner);

    return {
      providerKey: binding.providerKey,
      bindingFingerprint: fingerprint(binding.id),
      tenantFingerprint: fingerprint(binding.tenantId),
      workspaceFingerprint: fingerprint(binding.workspaceId),
      plannerEnabled: planner.enabled === true,
      rollout: rolloutValue(planner.rollout),
      maxLanesPerSource: numberValue(planner.maxLanesPerSource),
      maxItemsPerLane: numberValue(planner.maxItemsPerLane),
      maxSearchQueries: numberValue(planner.maxSearchQueries),
      includeEnrichment: booleanValue(planner.includeEnrichment),
      scanPassCount: arrayLength(config.scanPasses),
      searchQueryCount: arrayLength(config.searchQueries),
      searchQueryBudgetCount: arrayLength(config.searchQueryBudgets),
    };
  });
  const redditBindingCount = rows.filter(
    (item) => item.providerKey === "reddit",
  ).length;
  const xTwitterBindingCount = rows.filter(
    (item) => item.providerKey === "x-twitter",
  ).length;
  const qualityGates = {
    primaryBindingsPresent: rows.length > 0,
    redditBindingPresent: redditBindingCount > 0,
    xTwitterBindingPresent: xTwitterBindingCount > 0,
    everyBindingPlannerEnabled: rows.every((item) => item.plannerEnabled),
    everyBindingUsesCanaryRollout: rows.every(
      (item) => item.rollout === "real_binding_canary",
    ),
    redditKeepsExistingScanPasses: rows
      .filter((item) => item.providerKey === "reddit")
      .every((item) => item.scanPassCount > 0),
    xTwitterKeepsExistingSearchQueries: rows
      .filter((item) => item.providerKey === "x-twitter")
      .every((item) => item.searchQueryCount > 0),
    noRawSecretFragments: true,
  };

  return {
    schemaVersion: 1,
    artifactFormat: "source-query-planner-real-binding-canary-v1",
    generatedBy: "npm run check:source-query-planner-real-binding-canary",
    model: {
      mode: "real_binding_canary_config",
      liveNetwork: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys,
    },
    totals: {
      bindingCount: rows.length,
      redditBindingCount,
      xTwitterBindingCount,
    },
    bindings: rows,
    qualityGates,
    blockingPassed: false,
  };
}

async function readPrimaryBindings(
  pool: Pool,
): Promise<readonly SourceBindingRecord[]> {
  const result = await pool.query<SourceBindingRecord>(
    `
      select
        sb.id::text as "id",
        sb.tenant_id::text as "tenantId",
        sb.workspace_id::text as "workspaceId",
        sce.provider_key as "providerKey",
        sb.config as "config"
      from source_bindings sb
      join source_catalog_entries sce
        on sce.id = sb.source_catalog_entry_id
      where sb.deleted_at is null
        and sb.status = 'ENABLED'
        and sce.provider_key in ('reddit', 'x-twitter')
      order by sce.provider_key, sb.created_at, sb.id
    `,
  );

  return result.rows;
}

async function applyCanaryConfig(
  pool: Pool,
  bindings: readonly SourceBindingRecord[],
): Promise<number> {
  let applied = 0;

  for (const binding of bindings) {
    const nextConfig = withCanaryPlannerConfig(
      binding.providerKey,
      binding.config,
    );
    if (
      JSON.stringify(asRecord(binding.config)) === JSON.stringify(nextConfig)
    ) {
      continue;
    }

    await pool.query(
      `
        update source_bindings
        set config = $2::jsonb,
            updated_at = now()
        where id = $1::uuid
      `,
      [binding.id, JSON.stringify(nextConfig)],
    );
    applied += 1;
  }

  return applied;
}

function withCanaryPlannerConfig(
  providerKey: ProviderKey,
  value: unknown,
): Record<string, unknown> {
  const config = asRecord(value);
  const planner = asRecord(config.sourceQueryPlanner);
  const topic = plannerTopic(config, planner);

  return {
    ...config,
    sourceQueryPlanner: {
      ...planner,
      enabled: true,
      rollout: "real_binding_canary",
      ...(topic === undefined ? {} : { topic }),
      maxLanesPerSource: 8,
      maxItemsPerLane: 25,
      includeEnrichment: providerKey === "reddit",
      ...(providerKey === "x-twitter" ? { maxSearchQueries: 8 } : {}),
    },
  };
}

function plannerTopic(
  config: Readonly<Record<string, unknown>>,
  planner: Readonly<Record<string, unknown>>,
): string | undefined {
  const configured = nonEmptyString(planner.topic);
  if (configured !== undefined) {
    return configured;
  }

  const scanPassTopic = Array.isArray(config.scanPasses)
    ? config.scanPasses.map(asRecord).find((pass) => pass.mode === "search")
    : undefined;

  return (
    nonEmptyString(scanPassTopic?.query) ??
    (Array.isArray(config.searchQueries)
      ? config.searchQueries.map(nonEmptyString).find(Boolean)
      : undefined) ??
    nonEmptyString(config.query)
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function rolloutValue(
  value: unknown,
): "real_binding_canary" | "other" | "missing" {
  if (value === "real_binding_canary") {
    return "real_binding_canary";
  }

  return value === undefined ? "missing" : "other";
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as SourceQueryPlannerRealBindingCanaryReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "source-query-planner-real-binding-canary-v1" &&
    report.generatedBy ===
      "npm run check:source-query-planner-real-binding-canary" &&
    report.model.liveNetwork === false &&
    report.model.rawProviderConfigPersistedInReport === false &&
    report.qualityGates.noRawSecretFragments === true &&
    report.blockingPassed === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Source query planner real binding canary artifact OK (${report.totals.bindingCount} bindings)`,
  );
}
