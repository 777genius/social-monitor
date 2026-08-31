import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { Pool, type PoolClient } from "pg";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { canonicalizeReaderSummaryWeeklyJson } from
  "@social-monitor/summary/domain";

import { loadDotenvIfPresent } from "./lib/env-file";
import { readerSummaryProductionDayScope } from
  "./lib/reader-summary-production-day-scope";
import {
  verifyHistoricalPromotionArtifact,
  type HistoricalPromotionArtifactRecord,
} from "./lib/reader-summary-promotion-v2-historical-artifact";
import { requiredHistoricalPromotionSystemDatabaseUrl } from
  "./lib/reader-summary-promotion-v2-system-database";

export type RollbackAuthority = Readonly<{
  priorPublicationId: string;
  priorArtifactId: string;
  priorReportSha256: string;
  priorProofSha256: string;
  expectedCurrentPublicationId: string;
  expectedCurrentArtifactId: string;
  expectedCurrentReportSha256: string;
  expectedCurrentProofSha256: string;
}>;

export type MigrationReceipt = Readonly<{
  schemaVersion: 1;
  format: "reader-summary-promotion-v2-historical-rebuild-receipt-v1";
  date: string;
  status: "completed" | "noop";
  outputIdentity: Readonly<{
    artifactId: string;
    publicationId: string;
    reportSha256: string;
    proofSha256: string;
  }>;
  rollbackAuthority: RollbackAuthority;
  qualityGates: Readonly<Record<string, true | "not-exposed">>;
}>;

export type CanaryPublicationReceipt = Readonly<{
  schemaVersion: 1;
  format: "reader-summary-promotion-v2-canary-publication-receipt-v1";
  date: string;
  status: "published";
  publishedAt: string;
  outputIdentity: Readonly<{
    artifactId: string;
    publicationId: string;
    reportSha256: string;
    proofSha256: string;
  }>;
  rollbackAuthority: RollbackAuthority;
  receiptSha256: string;
}>;

export type RollbackAuthorityReceipt =
  | MigrationReceipt
  | CanaryPublicationReceipt;

if (require.main === module) {
  loadDotenvIfPresent(".env");
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message :
      "Promotion V2 rollback failed");
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const args = parseOptions(process.argv.slice(2));
  const receiptBytes = readFileSync(args.receiptPath);
  const receipt = parseRollbackAuthorityReceipt(receiptBytes);
  if (!args.underLock) {
    const tokenPath = join(
      args.artifactOutput,
      receipt.date,
      `rollback-fence-${randomUUID()}.txt`,
    );
    mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });
    const child = spawnSync("bash", [
      resolve(process.cwd(),
        "ops/deploy/production-runtime/reader-summary-date-lock.sh"),
      "--date", receipt.date,
      "--date-lock-dir", requiredAbsoluteEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_DATE_LOCK_DIR",
      ),
      "--fence-dir", requiredAbsoluteEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_FENCE_DIR",
      ),
      "--global-lock", requiredAbsoluteEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_DAILY_LOCK_PATH",
      ),
      "--require-preexisting-authority",
      "--canonical-global-lock", requiredAbsoluteEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_CANONICAL_DAILY_LOCK_PATH",
      ),
      "--canonical-date-lock-dir", requiredAbsoluteEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_CANONICAL_DATE_LOCK_DIR",
      ),
      "--canonical-fence-dir", requiredAbsoluteEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_CANONICAL_FENCE_DIR",
      ),
      "--wait-seconds", process.env
        .READER_SUMMARY_PROMOTION_REBUILD_LOCK_WAIT_SECONDS?.trim() ?? "7500",
      "--token-output", tokenPath,
      "--", process.execPath, ...process.execArgv,
      resolve(__filename),
      "--receipt", args.receiptPath,
      "--artifact-output", args.artifactOutput,
      "--under-lock", "--fence-token-path", tokenPath,
    ], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    if (child.status !== 0) process.exitCode = child.status ?? 1;
    return;
  }
  const fenceToken = readFileSync(args.fenceTokenPath!, "utf8").trim();
  const systemDatabaseUrl = requiredHistoricalPromotionSystemDatabaseUrl(
    process.env,
  );
  const pool = new Pool({
    connectionString: systemDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const rollbackReceipt = await rollback(pool, {
      receipt,
      authorityReceiptSha256: receipt.format ===
        "reader-summary-promotion-v2-canary-publication-receipt-v1"
        ? receipt.receiptSha256
        : sha256(receiptBytes),
      fenceToken,
      rolledBackAt: new Date().toISOString(),
    });
    const outputPath = join(
      args.artifactOutput,
      receipt.date,
      "reader-summary-promotion-v2-rollback.receipt.v1.json",
    );
    writeImmutable(outputPath, rollbackReceipt);
    console.log(`promotion_v2_rollback_receipt=${outputPath}`);
  } finally {
    await pool.end();
  }
}

const rollback = async (
  pool: Pool,
  input: {
    receipt: RollbackAuthorityReceipt;
    authorityReceiptSha256: string;
    fenceToken: string;
    rolledBackAt: string;
  },
): Promise<unknown> => {
  return runWithTenantDatabaseAccess(readerSummaryProductionDayScope, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      await preflightRole(client);
      await client.query(
        "SELECT set_config('social_monitor.system_access', 'true', true)",
      );
      const authority = input.receipt.rollbackAuthority;
      const [current, prior] = await Promise.all([
        publication(client, input.receipt.date,
          authority.expectedCurrentPublicationId),
        publication(
          client,
          input.receipt.date,
          authority.priorPublicationId,
          false,
          false,
        ),
      ]);
      if (verifyHistoricalPromotionArtifact(current).kind !== "valid-v2" ||
          verifyHistoricalPromotionArtifact(prior).kind !== "strict-v1") {
        throw new Error("Promotion V2 rollback artifact admission failed");
      }
      const result = await client.query<{ receipt: unknown }>(`
      select public."rollback_reader_summary_promotion_v2"(
        $1::uuid,$2::uuid,$3::date,$4::text,$5::text,$6::uuid,$7::uuid,
        $8::text,$9::text,$10::uuid,$11::uuid,$12::text,$13::text,
        $14::text,$15::timestamptz
      ) as receipt
      `, [
        readerSummaryProductionDayScope.tenantId,
        readerSummaryProductionDayScope.workspaceId,
        input.receipt.date,
        input.receipt.format,
        input.authorityReceiptSha256,
        authority.expectedCurrentPublicationId,
        authority.expectedCurrentArtifactId,
        authority.expectedCurrentReportSha256,
        authority.expectedCurrentProofSha256,
        authority.priorPublicationId,
        authority.priorArtifactId,
        authority.priorReportSha256,
        authority.priorProofSha256,
        input.fenceToken,
        input.rolledBackAt,
      ]);
      const restored = await publication(
        client,
        input.receipt.date,
        authority.priorPublicationId,
        true,
        false,
      );
      if (verifyHistoricalPromotionArtifact(restored).kind !== "strict-v1") {
        throw new Error("Legacy V1 reader cannot consume restored publication");
      }
      await client.query("COMMIT");
      return result.rows[0]?.receipt;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
};

const publication = async (
  client: PoolClient,
  date: string,
  publicationId: string,
  requireActive = false,
  requireRequestedDate = true,
): Promise<HistoricalPromotionArtifactRecord> => {
  const result = await client.query<HistoricalPromotionArtifactRecord>(`
    select artifact.id::text as "artifactId",
      artifact.tenant_id::text as "tenantId",
      artifact.workspace_id::text as "workspaceId",
      artifact.scope_type as "scopeType", artifact.interest_id::text as "interestId",
      artifact.cadence, artifact.period_started_at as "periodStartedAt",
      artifact.period_ended_at as "periodEndedAt",
      artifact.period_timezone as "periodTimezone", artifact.user_id as "userId",
      artifact.subscription_id::text as "subscriptionId", artifact.headline,
      artifact.summary_text as "summaryText", artifact.created_at as "createdAt",
      artifact.artifact_payload as "artifactPayload"
    from reader_summary_publications publication
    join reader_summary_artifacts artifact
      on artifact.id=publication.reader_summary_artifact_id
    ${requireActive ? "join reader_summary_publication_slots slot on slot.current_publication_id=publication.id" : ""}
    where publication.id=$1::uuid and publication.tenant_id=$2::uuid
      and publication.workspace_id=$3::uuid
      and ($4::date is null or publication.requested_utc_date=$4::date)
      ${requireActive ? "and artifact.status='COMPLETED'" : ""}
  `, [publicationId, readerSummaryProductionDayScope.tenantId,
    readerSummaryProductionDayScope.workspaceId,
    requireRequestedDate ? date : null]);
  if (result.rows.length !== 1) {
    throw new Error("Promotion V2 rollback publication proof is missing");
  }
  return result.rows[0]!;
};

const preflightRole = async (client: PoolClient): Promise<void> => {
  const result = await client.query<{ member: boolean }>(`select pg_has_role(
    current_user,'social_monitor_tenant_system_runtime','USAGE') as member`);
  if (result.rows[0]?.member !== true) {
    throw new Error("Promotion V2 rollback RLS system role preflight failed");
  }
};

export const parseRollbackAuthorityReceipt = (
  bytes: Buffer,
): RollbackAuthorityReceipt => {
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!isRecord(value)) {
    throw new Error("Promotion V2 rollback authority receipt is invalid");
  }
  return value.format ===
    "reader-summary-promotion-v2-canary-publication-receipt-v1"
    ? parseCanaryPublicationReceipt(value)
    : parseMigrationReceipt(bytes);
};

export const parseMigrationReceipt = (bytes: Buffer): MigrationReceipt => {
  const value = JSON.parse(bytes.toString("utf8")) as Partial<MigrationReceipt>;
  if (value.schemaVersion !== 1 || value.format !==
        "reader-summary-promotion-v2-historical-rebuild-receipt-v1" ||
      (value.status !== "completed" && value.status !== "noop") ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(value.date ?? "") ||
      !isRecord(value.outputIdentity) || !isRecord(value.rollbackAuthority) ||
      !isRecord(value.qualityGates) ||
      Object.values(value.qualityGates).some((gate) =>
        gate !== true && gate !== "not-exposed")) {
    throw new Error("Promotion V2 rollback migration receipt is incomplete");
  }
  for (const gate of [
    "artifactPromotionBoardValidated", "citationsVerified",
    "publicationProofVerified", "apiPromotionTupleVerified",
    "apiOrderedLanesVerified", "siteReaderRouteHttp200Verified",
  ]) {
    if (value.qualityGates[gate] !== true) {
      throw new Error(`Promotion V2 rollback receipt gate ${gate} is not proven`);
    }
  }
  if (value.qualityGates.siteFacingContractVerified !== true &&
      value.qualityGates.siteFacingContractVerified !== "not-exposed") {
    throw new Error(
      "Promotion V2 rollback site-facing contract gate is missing",
    );
  }
  const authority = value.rollbackAuthority as RollbackAuthority;
  for (const id of [authority.priorPublicationId, authority.priorArtifactId,
    authority.expectedCurrentPublicationId,
    authority.expectedCurrentArtifactId]) requiredUuid(id);
  for (const hash of [authority.priorReportSha256, authority.priorProofSha256,
    authority.expectedCurrentReportSha256,
    authority.expectedCurrentProofSha256]) requiredSha256(hash);
  if (value.outputIdentity.publicationId !==
        authority.expectedCurrentPublicationId ||
      value.outputIdentity.artifactId !== authority.expectedCurrentArtifactId ||
      value.outputIdentity.reportSha256 !==
        authority.expectedCurrentReportSha256 ||
      value.outputIdentity.proofSha256 !== authority.expectedCurrentProofSha256) {
    throw new Error("Promotion V2 rollback current tuple is inconsistent");
  }
  return value as MigrationReceipt;
};

const parseCanaryPublicationReceipt = (
  value: Record<string, unknown>,
): CanaryPublicationReceipt => {
  if (value.schemaVersion !== 1 || value.format !==
      "reader-summary-promotion-v2-canary-publication-receipt-v1" ||
      value.status !== "published" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(String(value.date ?? "")) ||
      typeof value.publishedAt !== "string" ||
      Number.isNaN(Date.parse(value.publishedAt)) ||
      !isRecord(value.outputIdentity) ||
      !isRecord(value.rollbackAuthority) ||
      typeof value.receiptSha256 !== "string") {
    throw new Error("Promotion V2 rollback canary receipt is incomplete");
  }
  requiredSha256(value.receiptSha256);
  const { receiptSha256, ...body } = value;
  if (canonicalizeReaderSummaryWeeklyJson(
    body,
    "Promotion V2 canary publication receipt",
  ).sha256 !== receiptSha256) {
    throw new Error("Promotion V2 rollback canary receipt hash is invalid");
  }
  const authority = value.rollbackAuthority as RollbackAuthority;
  for (const id of [authority.priorPublicationId, authority.priorArtifactId,
    authority.expectedCurrentPublicationId,
    authority.expectedCurrentArtifactId]) requiredUuid(id);
  for (const hash of [authority.priorReportSha256, authority.priorProofSha256,
    authority.expectedCurrentReportSha256,
    authority.expectedCurrentProofSha256]) requiredSha256(hash);
  const output = value.outputIdentity;
  if (output.publicationId !== authority.expectedCurrentPublicationId ||
      output.artifactId !== authority.expectedCurrentArtifactId ||
      output.reportSha256 !== authority.expectedCurrentReportSha256 ||
      output.proofSha256 !== authority.expectedCurrentProofSha256) {
    throw new Error("Promotion V2 rollback current tuple is inconsistent");
  }
  return value as CanaryPublicationReceipt;
};

const parseOptions = (args: readonly string[]) => {
  const underLock = args.includes("--under-lock");
  const read = (name: string): string => {
    const index = args.indexOf(name);
    const value = index < 0 ? undefined : args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} is required`);
    }
    return resolve(value);
  };
  return {
    receiptPath: read("--receipt"),
    artifactOutput: read("--artifact-output"),
    underLock,
    fenceTokenPath: underLock ? read("--fence-token-path") : undefined,
  };
};

const requiredAbsoluteEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || !value.startsWith("/")) {
    throw new Error(`${name} must be an absolute pre-existing authority path`);
  }
  return resolve(value);
};
const requiredUuid = (value: string): void => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error("Promotion V2 rollback UUID is invalid");
  }
};
const requiredSha256 = (value: string): void => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Promotion V2 rollback SHA-256 is invalid");
  }
};
const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const writeImmutable = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx", mode: 0o400,
  });
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
