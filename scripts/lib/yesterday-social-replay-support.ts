import { existsSync, readFileSync } from "node:fs";

import { Pool } from "pg";

import {
  tenantId,
  type TenantId,
  workspaceId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

type ScopeRow = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly feedItemCount: string;
};

export type CollectionIntegrityStatus =
  | {
      readonly status: "clean";
    }
  | {
      readonly status: "collection_integrity_failed";
      readonly reason: string;
      readonly evidence: {
        readonly feedItemCount: number;
        readonly orphanInterestCount: number;
        readonly orphanSourceBindingCount: number;
      };
      readonly action: string;
    };

type CollectionIntegrityOverrideFile = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "collection-integrity-overrides-v1";
  readonly records: readonly CollectionIntegrityOverrideRecord[];
};

type CollectionIntegrityOverrideRecord = {
  readonly collectionDate: string;
  readonly status: "collection_integrity_failed";
  readonly reason: string;
  readonly evidence: {
    readonly feedItemCount: number;
    readonly orphanInterestCount: number;
    readonly orphanSourceBindingCount: number;
  };
  readonly action: string;
};

export const defaultYesterdaySocialQualityDatabaseUrl =
  "postgresql://social_monitor:social_monitor_local_password@127.0.0.1:55432/social_monitor";

export const collectionIntegrityOverridesPath =
  "ops/evals/collection-integrity-overrides.v1.json";

export const forbiddenSerializedFragments = [
  "access_token",
  "refresh_token",
  "api_key",
  "client_secret",
  "authorization",
  "cookie",
  "private_key",
  "postgres://",
  "postgresql://",
  "amqp://",
  "bearer ",
  "sk-proj-",
  "sk-live-",
];

export const yesterdaySocialQualityDatabaseUrl = (): string =>
  process.env.YESTERDAY_SOCIAL_QUALITY_DATABASE_URL ??
  defaultYesterdaySocialQualityDatabaseUrl;

export async function readDominantFeedScope(params: {
  readonly databaseUrl: string;
  readonly collectionDate: string;
}): Promise<{
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}> {
  const pool = new Pool({
    connectionString: params.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const result = await pool.query<ScopeRow>(
      `
        select
          tenant_id::text as "tenantId",
          workspace_id::text as "workspaceId",
          count(*)::text as "feedItemCount"
        from feed_items
        where observed_at >= $1::timestamptz
          and observed_at < $2::timestamptz
        group by tenant_id, workspace_id
        order by count(*) desc
        limit 1
      `,
      [
        `${params.collectionDate}T00:00:00.000Z`,
        new Date(nextDate(params.collectionDate)).toISOString(),
      ],
    );
    const row = result.rows[0];

    if (row === undefined || Number.parseInt(row.feedItemCount, 10) === 0) {
      throw new Error("No feed items found for yesterday replay window.");
    }

    return {
      tenantId: tenantId(row.tenantId),
      workspaceId: workspaceId(row.workspaceId),
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export function nextDate(value: string): string {
  assertCollectionDate(value);
  const start = new Date(`${value}T00:00:00.000Z`);

  return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function collectionDateOptionOrDefault(defaultValue: string): {
  readonly collectionDate: string;
  readonly wasExplicit: boolean;
} {
  const option = readOption("--date");
  const collectionDate = option ?? defaultValue;

  assertCollectionDate(collectionDate);

  return {
    collectionDate,
    wasExplicit: option !== undefined,
  };
}

export function readCollectionIntegrityStatus(
  collectionDate: string,
): CollectionIntegrityStatus {
  assertCollectionDate(collectionDate);

  if (!existsSync(collectionIntegrityOverridesPath)) {
    return { status: "clean" };
  }

  const parsed = JSON.parse(
    readFileSync(collectionIntegrityOverridesPath, "utf8"),
  ) as CollectionIntegrityOverrideFile;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.artifactFormat !== "collection-integrity-overrides-v1"
  ) {
    throw new Error(
      `${collectionIntegrityOverridesPath} has an unsupported format`,
    );
  }

  const record = parsed.records.find(
    (item) => item.collectionDate === collectionDate,
  );

  return record === undefined
    ? { status: "clean" }
    : {
        status: record.status,
        reason: record.reason,
        evidence: record.evidence,
        action: record.action,
      };
}

export function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

export function fingerprint(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

export function noRawSecretFragments(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  return forbiddenSerializedFragments.every(
    (fragment) => !serialized.includes(fragment),
  );
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    throw new Error(`Collection date is not a valid calendar date: ${value}`);
  }
}
