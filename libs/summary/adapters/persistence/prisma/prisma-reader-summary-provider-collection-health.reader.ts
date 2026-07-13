import type {
  ReaderSummaryProviderCollectionHealth,
  ReaderSummaryProviderCollectionHealthReaderPort,
  ReaderSummaryProviderCollectionState,
} from "../../../ports";

type RawQueryClient = {
  readonly $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
};

type ProviderCollectionHealthRow = {
  readonly provider_key: string;
  readonly source_binding_id: string;
  readonly status: string;
  readonly execution_metadata: unknown;
};

type ParsedCollectionTelemetry = {
  readonly state: ReaderSummaryProviderCollectionState;
  readonly targetItemCount?: number;
  readonly collectedItemCount: number;
  readonly acceptedItemCount: number;
  readonly insertedItemCount: number;
  readonly outsideWindowItemCount: number;
  readonly paginationDuplicateItemCount: number;
  readonly storageDuplicateItemCount: number;
  readonly pageCount: number;
  readonly paginationStopReason?: string;
  readonly failureKind?: string;
  readonly rateLimitEventCount: number;
  readonly oldestAcceptedPublishedAt?: Date;
  readonly newestAcceptedPublishedAt?: Date;
};

export class PrismaReaderSummaryProviderCollectionHealthReader implements ReaderSummaryProviderCollectionHealthReaderPort {
  constructor(private readonly prisma: RawQueryClient) {}

  async readProviderCollectionHealth(
    query: Parameters<
      ReaderSummaryProviderCollectionHealthReaderPort["readProviderCollectionHealth"]
    >[0],
  ): Promise<readonly ReaderSummaryProviderCollectionHealth[]> {
    const interestId =
      query.scope.type === "interest" ? query.scope.interestId : null;
    const observedThrough = query.observedThrough ?? null;
    const rows = await this.prisma.$queryRaw<ProviderCollectionHealthRow[]>`
      with latest_binding_scans as (
        select distinct on (sj.source_binding_id)
          sce.provider_key,
          sj.source_binding_id,
          sj.status::text as status,
          sj.execution_metadata
        from scan_jobs sj
        join source_bindings sb
          on sb.id = sj.source_binding_id
         and sb.tenant_id = sj.tenant_id
         and sb.workspace_id = sj.workspace_id
        join source_catalog_entries sce
          on sce.id = sb.source_catalog_entry_id
        where sj.tenant_id = ${query.tenantId}::uuid
          and sj.workspace_id = ${query.workspaceId}::uuid
          and (${interestId}::uuid is null or sb.interest_id = ${interestId}::uuid)
          and sj.execution_metadata is not null
          and sj.status in ('SUCCEEDED', 'FAILED')
          and sj.execution_metadata->>'targetPublishedWindowStartedAt' = ${query.period.startedAt.toISOString()}
          and sj.execution_metadata->>'targetPublishedWindowEndedAt' = ${query.period.endedAt.toISOString()}
          and (${observedThrough}::timestamptz is null or sj.completed_at <= ${observedThrough}::timestamptz)
        order by
          sj.source_binding_id,
          sj.completed_at desc nulls last,
          sj.requested_at desc,
          sj.id desc
      )
      select
        provider_key,
        source_binding_id,
        status,
        execution_metadata
      from latest_binding_scans
      order by provider_key asc, source_binding_id asc
    `;

    return aggregateProviderRows(rows);
  }
}

const aggregateProviderRows = (
  rows: readonly ProviderCollectionHealthRow[],
): readonly ReaderSummaryProviderCollectionHealth[] => {
  const providers = new Map<string, ParsedCollectionTelemetry[]>();
  for (const row of rows) {
    const telemetry = parseTelemetry(row);
    if (telemetry === undefined) {
      continue;
    }
    const providerKey = row.provider_key.trim();
    if (providerKey.length === 0) {
      continue;
    }
    providers.set(providerKey, [
      ...(providers.get(providerKey) ?? []),
      telemetry,
    ]);
  }

  return [...providers.entries()]
    .map(([providerKey, telemetry]) =>
      aggregateProviderTelemetry(providerKey, telemetry),
    )
    .sort((left, right) => left.providerKey.localeCompare(right.providerKey));
};

const aggregateProviderTelemetry = (
  providerKey: string,
  telemetry: readonly ParsedCollectionTelemetry[],
): ReaderSummaryProviderCollectionHealth => {
  const targetCounts = telemetry
    .map((entry) => entry.targetItemCount)
    .filter((value): value is number => value !== undefined);
  const oldestAcceptedPublishedAt = earliestDate(
    telemetry.map((entry) => entry.oldestAcceptedPublishedAt),
  );
  const newestAcceptedPublishedAt = latestDate(
    telemetry.map((entry) => entry.newestAcceptedPublishedAt),
  );

  return {
    providerKey,
    state: aggregateState(telemetry.map((entry) => entry.state)),
    scanCount: telemetry.length,
    ...(targetCounts.length === 0
      ? {}
      : { targetItemCount: sum(targetCounts) }),
    collectedItemCount: sum(telemetry.map((entry) => entry.collectedItemCount)),
    acceptedItemCount: sum(telemetry.map((entry) => entry.acceptedItemCount)),
    insertedItemCount: sum(telemetry.map((entry) => entry.insertedItemCount)),
    outsideWindowItemCount: sum(
      telemetry.map((entry) => entry.outsideWindowItemCount),
    ),
    paginationDuplicateItemCount: sum(
      telemetry.map((entry) => entry.paginationDuplicateItemCount),
    ),
    storageDuplicateItemCount: sum(
      telemetry.map((entry) => entry.storageDuplicateItemCount),
    ),
    pageCount: sum(telemetry.map((entry) => entry.pageCount)),
    paginationStopReasons: [
      ...new Set(
        telemetry
          .map((entry) => entry.paginationStopReason)
          .filter((value): value is string => value !== undefined),
      ),
    ].sort(),
    failureKinds: [
      ...new Set(
        telemetry
          .map((entry) => entry.failureKind)
          .filter((value): value is string => value !== undefined),
      ),
    ].sort(),
    rateLimitEventCount: sum(
      telemetry.map((entry) => entry.rateLimitEventCount),
    ),
    ...(oldestAcceptedPublishedAt === undefined
      ? {}
      : { oldestAcceptedPublishedAt }),
    ...(newestAcceptedPublishedAt === undefined
      ? {}
      : { newestAcceptedPublishedAt }),
  };
};

const parseTelemetry = (
  row: ProviderCollectionHealthRow,
): ParsedCollectionTelemetry | undefined => {
  const metadata = recordValue(row.execution_metadata);
  if (integerValue(metadata?.schemaVersion) !== 1) {
    return undefined;
  }
  const status = stringValue(metadata?.status) ?? row.status.toLowerCase();
  const stopReason = stringValue(metadata?.paginationStopReason);
  const failureKind = stringValue(metadata?.failureKind);
  const rateLimitEventCount = integerValue(metadata?.rateLimitEventCount) ?? 0;
  const targetItemCount = integerValue(metadata?.targetItemCount);
  const acceptedItemCount = integerValue(metadata?.acceptedItemCount) ?? 0;
  const oldestAcceptedPublishedAt = dateValue(
    metadata?.oldestAcceptedPublishedAt,
  );
  const newestAcceptedPublishedAt = dateValue(
    metadata?.newestAcceptedPublishedAt,
  );

  return {
    state: collectionState({
      status,
      stopReason,
      rateLimitEventCount,
      targetItemCount,
      acceptedItemCount,
    }),
    ...(targetItemCount === undefined ? {} : { targetItemCount }),
    collectedItemCount: integerValue(metadata?.collectedItemCount) ?? 0,
    acceptedItemCount,
    insertedItemCount: integerValue(metadata?.insertedItemCount) ?? 0,
    outsideWindowItemCount: integerValue(metadata?.outsideWindowItemCount) ?? 0,
    paginationDuplicateItemCount:
      integerValue(metadata?.paginationDuplicateItemCount) ?? 0,
    storageDuplicateItemCount:
      integerValue(metadata?.storageDuplicateItemCount) ?? 0,
    pageCount: integerValue(metadata?.pageCount) ?? 0,
    ...(stopReason === undefined ? {} : { paginationStopReason: stopReason }),
    ...(failureKind === undefined ? {} : { failureKind }),
    rateLimitEventCount,
    ...(oldestAcceptedPublishedAt === undefined
      ? {}
      : { oldestAcceptedPublishedAt }),
    ...(newestAcceptedPublishedAt === undefined
      ? {}
      : { newestAcceptedPublishedAt }),
  };
};

const collectionState = (params: {
  readonly status: string;
  readonly stopReason: string | undefined;
  readonly rateLimitEventCount: number;
  readonly targetItemCount: number | undefined;
  readonly acceptedItemCount: number;
}): ReaderSummaryProviderCollectionState => {
  if (params.status === "failed") {
    return "unavailable";
  }
  if (params.acceptedItemCount === 0) {
    return "unavailable";
  }
  if (
    params.rateLimitEventCount > 0 ||
    params.stopReason === "partial_retryable_failure"
  ) {
    return "degraded";
  }
  if (
    params.targetItemCount !== undefined &&
    params.acceptedItemCount >= params.targetItemCount
  ) {
    return "complete";
  }
  if (params.targetItemCount === undefined) {
    return "complete";
  }
  return "partial";
};

const aggregateState = (
  states: readonly ReaderSummaryProviderCollectionState[],
): ReaderSummaryProviderCollectionState => {
  if (states.every((state) => state === "unavailable")) {
    return "unavailable";
  }
  if (states.some((state) => state === "unavailable" || state === "degraded")) {
    return "degraded";
  }
  return states.some((state) => state === "partial") ? "partial" : "complete";
};

const recordValue = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const integerValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const dateValue = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const earliestDate = (
  values: readonly (Date | undefined)[],
): Date | undefined => dateBoundary(values, Math.min);

const latestDate = (values: readonly (Date | undefined)[]): Date | undefined =>
  dateBoundary(values, Math.max);

const dateBoundary = (
  values: readonly (Date | undefined)[],
  select: (...values: number[]) => number,
): Date | undefined => {
  const timestamps = values
    .filter((value): value is Date => value !== undefined)
    .map((value) => value.getTime())
    .filter(Number.isFinite);
  return timestamps.length === 0 ? undefined : new Date(select(...timestamps));
};

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
