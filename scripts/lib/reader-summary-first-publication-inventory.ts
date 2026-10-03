import { createHash } from "node:crypto";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { captureReaderSummaryDayDatasetManifest, parseReaderSummaryDayDatasetManifest, assertReaderSummaryDatasetManifestDigest,
  type ReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";

export type FirstPublicationInventory = Readonly<{
  format: "reader-summary-first-publication-inventory-v1";
  datasetManifest: ReaderSummaryDayDatasetManifest;
  observationScopeSha256: string;
  coverage: "UNPROVEN";
}>;

type Client = Pick<PrismaSummaryClient, "$queryRaw">;

/** Reads every visible published-day row, including invalid joins. No cutoff
 * filter may shrink the expected inventory to the in-day observation count. */
export async function readFirstPublicationObservationScope(client: Client,
  manifest: ReaderSummaryDayDatasetManifest): Promise<string> {
  const rows = await runWithTenantDatabaseAccess(manifest.scope, () => client.$queryRaw<readonly {
    visibleCount: number; validCount: number; scopeValid: boolean; sha256: string;
  }[]>`
    select * from public.observe_reader_summary_first_publication(
      ${manifest.scope.tenantId}::uuid, ${manifest.scope.workspaceId}::uuid,
      ${new Date(manifest.period.startedAt)}, ${new Date(manifest.period.endedAt)},
      ${new Date(manifest.generatedAt)})
  `);
  const row = rows[0];
  if (rows.length !== 1 || row === undefined || row.scopeValid !== true ||
      row.visibleCount !== manifest.dataset.feedRowCount || row.validCount !== row.visibleCount ||
      !/^[0-9a-f]{64}$/u.test(row.sha256)) {
    throw new Error("First publication inventory observation, canonical join or active scope is invalid");
  }
  return row.sha256;
}

export async function captureFirstPublicationInventory(
  params: Parameters<typeof captureReaderSummaryDayDatasetManifest>[0],
): Promise<FirstPublicationInventory> {
  const datasetManifest = await captureReaderSummaryDayDatasetManifest(params);
  assertFirstPublicationInventoryPeriod(datasetManifest);
  return { format: "reader-summary-first-publication-inventory-v1", datasetManifest,
    observationScopeSha256: await readFirstPublicationObservationScope(params.client, datasetManifest), coverage: "UNPROVEN" };
}

export function parseFirstPublicationInventory(bytes: Uint8Array): FirstPublicationInventory {
  const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as FirstPublicationInventory;
  if (value?.format !== "reader-summary-first-publication-inventory-v1" ||
      value.coverage !== "UNPROVEN" || !/^[0-9a-f]{64}$/u.test(value.observationScopeSha256)) {
    throw new Error("First publication inventory manifest is invalid");
  }
  const datasetManifest = parseReaderSummaryDayDatasetManifest(Buffer.from(JSON.stringify(value.datasetManifest)));
  assertFirstPublicationInventoryPeriod(datasetManifest);
  return { ...value, datasetManifest };
}

export function assertFirstPublicationInventoryPeriod(manifest: ReaderSummaryDayDatasetManifest): void {
  assertReaderSummaryDatasetManifestDigest(manifest);
  const start = Date.parse(manifest.period.startedAt), end = Date.parse(manifest.period.endedAt);
  const asof = Date.parse(manifest.generatedAt);
  // JS reads use milliseconds; reject extra precision instead of silently
  // truncating an authoritative microsecond boundary in SQL or GitHub reads.
  if (![start, end, asof].every(Number.isFinite) ||
      new Date(asof).toISOString() !== manifest.generatedAt || start % 86_400_000 !== 0 ||
      end - start !== 86_400_000 || end > asof || manifest.policy.timestampPolicy !== "published_at" ||
      manifest.retainedEngagementAuthority !== undefined) {
    throw new Error("First publication requires a completed exact UTC published_at day and millisecond as-of precision");
  }
}

export const firstPublicationBytesSha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
