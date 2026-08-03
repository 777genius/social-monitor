import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
  type ReaderSummaryCadence,
  type ReaderSummaryGitHubProjectionAudit,
} from "../../../domain";
import type {
  ReaderSummaryDailyCanonicalRecoveryV4Binding,
  FindReaderSummaryWeeklyArtifactQuery,
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  PersistedReaderSummaryWeeklyArtifact,
  ReaderSummaryPeriodSummary,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryRejectedArtifactDebug,
  ReaderSummaryWeeklyArtifactRepositoryPort,
  SaveReaderSummaryWeeklyArtifactCommand,
} from "../../../ports";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  readerSummaryArtifactFromPrisma,
  readerSummaryCitationsToPrisma,
  readerSummaryQualitySignalsToPrisma,
  type PrismaReaderSummaryArtifactRecord,
  type PrismaReaderSummaryPeriodSummaryRecord,
  readerSummaryScopeToPrisma,
  serializeReaderSummaryArtifact,
} from "./prisma-reader-summary-records";
import { readerSummaryScopeFromPrisma } from "./prisma-reader-summary-artifact-payload";
import {
  encodeSummaryCursor,
  parseSummaryCursor,
  type PrismaSummaryStatus,
} from "./prisma-summary-records";
import {
  findReaderSummaryWeeklyArtifactById,
  saveReaderSummaryWeeklyArtifact,
} from "./prisma-reader-summary-weekly-artifact";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

const VISIBLE_READER_SUMMARY_STATUSES = ["COMPLETED"] as const;
const PUBLISHED_READER_SUMMARY_STATUSES = [
  ...VISIBLE_READER_SUMMARY_STATUSES,
  "NO_SIGNAL",
] as const;
const dailyCanonicalRecoveryDates: readonly string[] = [
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
];

type DailyCanonicalRecoveryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
}>;

type ReaderSummaryPublicationDecisionForPersistence = NonNullable<
  NonNullable<
    Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1]
  >["publicationDecision"]
>;

export class PrismaReaderSummaryArtifactRepository implements
  ReaderSummaryArtifactRepositoryPort, ReaderSummaryWeeklyArtifactRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(
    artifact: ReaderSummaryArtifact,
    options?: Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1],
  ): Promise<void> {
    const snapshot = artifact.toSnapshot();
    const recoveryScope = dailyCanonicalRecoveryScope(snapshot);
    const existing = await this.prisma.readerSummaryArtifact.findFirst({
      where: {
        id: snapshot.readerSummaryId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
      },
    });
    if (existing !== null) {
      const persistedRecoveryScope = dailyCanonicalRecoveryScopeFromPersisted(
        existing,
      );
      if (persistedRecoveryScope !== undefined) {
        const classified = await withPrismaWriteRetry(() =>
          runSerializableReaderSummaryTransaction(
            this.prisma,
            (prisma) => verifyReaderSummaryDailyCanonicalRecoveryV4Provenance({
              prisma,
              scope: persistedRecoveryScope,
              audit: storedGithubProjectionAudit(existing.qualitySignals),
            }),
          ),
        );
        if (classified === undefined) return;
        const verified = await withPrismaWriteRetry(() =>
          runSerializableReaderSummaryTransaction(
            this.prisma,
            (prisma) => verifyReaderSummaryDailyCanonicalRecoveryV4Provenance({
              prisma,
              readerSummaryArtifactId: snapshot.readerSummaryId,
            }),
          ),
        );
        if (classified !== true || verified !== true) {
          throw new Error(
            "Daily canonical recovery artifact was not re-verified by PostgreSQL",
          );
        }
      }
      return;
    }
    const publicationDecision = options?.publicationDecision;
    const ordinaryGitHubProjectionVerified =
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: options?.githubProjectionAudit,
      });
    const artifactPayload = serializeReaderSummaryArtifact(artifact);
    const citations = readerSummaryCitationsToPrisma(artifact);
    const qualitySignals = {
      ...readerSummaryQualitySignalsToPrisma(artifact),
      ...(publicationDecision === undefined ? {} : { publicationDecision }),
      ...(options?.githubProjectionAudit === undefined
        ? {}
        : { githubProjectionAudit: options.githubProjectionAudit }),
    };
    const scopeFields = readerSummaryScopeToPrisma(snapshot.scope);

    await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(this.prisma, async (prisma) => {
        const recoveryVerified = recoveryScope === undefined
          ? undefined
          : await verifyReaderSummaryDailyCanonicalRecoveryV4Provenance({
              prisma,
              artifact,
              audit: options?.githubProjectionAudit,
            });
        if (recoveryScope !== undefined && recoveryVerified !== undefined &&
          recoveryVerified !== true) {
          throw new Error(
            "Daily canonical recovery artifact was not re-verified by PostgreSQL",
          );
        }
        const githubProjectionVerified = recoveryVerified ??
          ordinaryGitHubProjectionVerified;
        const status: PrismaSummaryStatus =
          publicationDecision?.status === "rejected" || !githubProjectionVerified
            ? "REJECTED"
            : "RUNNING";
        await prisma.readerSummaryArtifact.upsert({
          where: { id: snapshot.readerSummaryId },
          update: {
            ...scopeFields,
            cadence: snapshot.period.cadence,
            periodStartedAt: snapshot.period.startedAt,
            periodEndedAt: snapshot.period.endedAt,
            periodTimezone: snapshot.period.timezone,
            periodKey: snapshot.period.periodKey,
            status,
            userId: snapshot.userId ?? null,
            subscriptionId: snapshot.subscriptionId ?? null,
            modelVersion: snapshot.lineage.modelVersion,
            promptVersion: snapshot.lineage.promptVersion,
            headline: snapshot.headline,
            summaryText: snapshot.executiveSummary,
            artifactPayload,
            citations,
            qualitySignals,
          },
          create: {
            id: snapshot.readerSummaryId,
            tenantId: snapshot.tenantId,
            workspaceId: snapshot.workspaceId,
            ...scopeFields,
            cadence: snapshot.period.cadence,
            periodStartedAt: snapshot.period.startedAt,
            periodEndedAt: snapshot.period.endedAt,
            periodTimezone: snapshot.period.timezone,
            periodKey: snapshot.period.periodKey,
            userId: snapshot.userId ?? null,
            subscriptionId: snapshot.subscriptionId ?? null,
            status,
            schemaVersion: 1,
            modelVersion: snapshot.lineage.modelVersion,
            promptVersion: snapshot.lineage.promptVersion,
            headline: snapshot.headline,
            summaryText: snapshot.executiveSummary,
            artifactPayload,
            citations,
            qualitySignals,
          },
        });
      }),
    );
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    const offset = parseSummaryCursor(query.cursor);
    const where = readerSummaryArtifactWhere(query);
    const [records, total] = await Promise.all([
      this.prisma.readerSummaryArtifact.findMany({
        where,
        orderBy: [
          { periodStartedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.readerSummaryArtifact.count({ where }),
    ]);
    const items = records.map((record) =>
      readerSummaryArtifactFromPrisma(record),
    );
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < total ? encodeSummaryCursor(nextOffset) : undefined,
    };
  }

  async listPeriodSummaries(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryPeriodSummariesResult> {
    const offset = parseSummaryCursor(query.cursor);
    const where = readerSummaryArtifactWhere(query);
    const [records, total] = await Promise.all([
      this.prisma.readerSummaryArtifact.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          workspaceId: true,
          scopeType: true,
          scopeKey: true,
          interestId: true,
          cadence: true,
          periodStartedAt: true,
          periodEndedAt: true,
          periodTimezone: true,
          periodKey: true,
          userId: true,
          subscriptionId: true,
          status: true,
          headline: true,
        },
        orderBy: [
          { periodStartedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.readerSummaryArtifact.count({ where }),
    ]);
    const items = records.map(periodSummaryFromPrisma);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < total ? encodeSummaryCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryArtifact | null> {
    const record = await this.prisma.readerSummaryArtifact.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.readerSummaryId,
        status: { in: PUBLISHED_READER_SUMMARY_STATUSES },
        publication: currentPublicationFilter,
      },
    });

    return record === null ? null : readerSummaryArtifactFromPrisma(record);
  }

  async findRejectedDebugById(
    params: Parameters<
      ReaderSummaryArtifactRepositoryPort["findRejectedDebugById"]
    >[0],
  ): Promise<ReaderSummaryRejectedArtifactDebug | null> {
    const record = await this.prisma.readerSummaryArtifact.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.readerSummaryId,
        status: { in: ["REJECTED"] },
      },
    });

    return record === null ? null : rejectedDebugFromPrisma(record);
  }
  async saveWeekly(command: SaveReaderSummaryWeeklyArtifactCommand): Promise<void> {
    await saveReaderSummaryWeeklyArtifact(this.prisma, command);
  }

  async findWeeklyById(
    query: FindReaderSummaryWeeklyArtifactQuery,
  ): Promise<PersistedReaderSummaryWeeklyArtifact | null> {
    return findReaderSummaryWeeklyArtifactById(this.prisma, query);
  }
}

/**
 * The V4 recovery audit is data, never an in-process capability. This one
 * PostgreSQL predicate is called before an artifact can be RUNNING and again
 * from the fenced final-publication path.
 */
export const verifyReaderSummaryDailyCanonicalRecoveryV4Provenance = async (
  input: Readonly<{
    prisma: PrismaReaderSummaryClient;
    artifact?: ReaderSummaryArtifact;
    audit?: ReaderSummaryGitHubProjectionAudit;
    readerSummaryArtifactId?: string;
    scope?: DailyCanonicalRecoveryScope;
  }>,
): Promise<boolean | undefined> => {
  const sourceCount = Number(input.artifact !== undefined) +
    Number(input.readerSummaryArtifactId !== undefined) +
    Number(input.scope !== undefined);
  if (sourceCount !== 1) {
    throw new Error(
      "Daily canonical recovery verifier requires one canonical artifact scope source",
    );
  }
  const scope = input.scope ?? (input.artifact === undefined
    ? undefined
    : dailyCanonicalRecoveryScope(input.artifact.toSnapshot()));
  if (input.artifact !== undefined && scope === undefined) return undefined;
  const audit = input.audit;
  const binding = dailyCanonicalRecoveryBinding(audit);
  if (binding !== undefined && input.artifact !== undefined) {
    if (!bindingMatchesArtifact(binding, input.artifact)) {
      throw new Error("Daily canonical recovery audit scope diverged from artifact");
    }
  }
  const rows = await input.prisma.$queryRaw<readonly {
    verified: boolean | null;
  }[]>`
    SELECT public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
      ${scope?.tenantId ?? null}::UUID,
      ${scope?.workspaceId ?? null}::UUID,
      ${scope?.requestedUtcDate ?? null}::DATE,
      ${audit === undefined ? null : JSON.stringify(audit)}::JSONB,
      ${input.readerSummaryArtifactId ?? null}::UUID
    ) AS verified
  `;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error("Daily canonical recovery PostgreSQL verifier returned no outcome");
  }
  return rows[0].verified === null ? undefined : rows[0].verified === true;
};

const dailyCanonicalRecoveryBinding = (
  audit: ReaderSummaryGitHubProjectionAudit | undefined,
): ReaderSummaryDailyCanonicalRecoveryV4Binding | undefined => {
  if (audit === undefined || !("recoveryV4" in audit)) return undefined;
  const binding = audit.recoveryV4 as unknown;
  if (typeof binding !== "object" || binding === null || Array.isArray(binding)) {
    return undefined;
  }
  const value = binding as Record<string, unknown>;
  const expectedKeys = [
    "schemaVersion",
    "recoveryVersion",
    "selectedOutputKind",
    "sourceAuthoritySchemaVersion",
    "tenantId",
    "workspaceId",
    "requestedUtcDate",
    "ingestionCutoff",
    "sourceAuthoritySha256",
    "modelJobIdentity",
    "outputTextSha256",
    "outputTextByteLength",
    "githubProjectionSha256",
  ] as const;
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in value)) ||
    value.schemaVersion !== "reader_summary.daily_canonical_recovery_provenance.v2" ||
    value.recoveryVersion !== "reader_summary.daily_canonical_recovery.v4" ||
    value.selectedOutputKind !== "output_text" ||
    value.sourceAuthoritySchemaVersion !== 2 ||
    !isText(value.tenantId) ||
    !isText(value.workspaceId) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(String(value.requestedUtcDate)) ||
    !isExactIso(value.ingestionCutoff) ||
    !isSha256(value.sourceAuthoritySha256) ||
    !isSha256(value.modelJobIdentity) ||
    !isSha256(value.outputTextSha256) ||
    !isSha256(value.githubProjectionSha256) ||
    !Number.isSafeInteger(value.outputTextByteLength) ||
    (value.outputTextByteLength as number) < 1
  ) {
    return undefined;
  }
  return value as unknown as ReaderSummaryDailyCanonicalRecoveryV4Binding;
};

const storedGithubProjectionAudit = (
  qualitySignals: unknown,
): ReaderSummaryGitHubProjectionAudit | undefined => {
  if (
    typeof qualitySignals !== "object" || qualitySignals === null ||
    Array.isArray(qualitySignals)
  ) {
    return undefined;
  }
  const audit = (qualitySignals as Record<string, unknown>).githubProjectionAudit;
  return typeof audit === "object" && audit !== null && !Array.isArray(audit)
    ? audit as ReaderSummaryGitHubProjectionAudit
    : undefined;
};

const dailyCanonicalRecoveryScope = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): DailyCanonicalRecoveryScope | undefined => {
  const requestedUtcDate = snapshot.period.startedAt.toISOString().slice(0, 10);
  if (
    snapshot.scope.type !== "workspace" ||
    snapshot.period.cadence !== "daily" ||
    snapshot.period.timezone !== "UTC" ||
    snapshot.period.startedAt.toISOString() !==
      `${requestedUtcDate}T00:00:00.000Z` ||
    snapshot.period.endedAt.toISOString() !== nextUtcDate(requestedUtcDate) ||
    !dailyCanonicalRecoveryDates.includes(requestedUtcDate)
  ) {
    return undefined;
  }
  return {
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    requestedUtcDate,
  };
};

const dailyCanonicalRecoveryScopeFromPersisted = (
  record: PrismaReaderSummaryArtifactRecord,
): DailyCanonicalRecoveryScope | undefined => {
  const requestedUtcDate = record.periodStartedAt.toISOString().slice(0, 10);
  if (
    record.scopeType !== "workspace" ||
    record.cadence !== "daily" ||
    record.periodTimezone !== "UTC" ||
    record.periodStartedAt.toISOString() !==
      `${requestedUtcDate}T00:00:00.000Z` ||
    record.periodEndedAt.toISOString() !== nextUtcDate(requestedUtcDate) ||
    !dailyCanonicalRecoveryDates.includes(requestedUtcDate)
  ) {
    return undefined;
  }
  return {
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    requestedUtcDate,
  };
};

const bindingMatchesArtifact = (
  binding: ReaderSummaryDailyCanonicalRecoveryV4Binding,
  artifact: ReaderSummaryArtifact,
): boolean => {
  const snapshot = artifact.toSnapshot();
  return binding.tenantId === snapshot.tenantId &&
    binding.workspaceId === snapshot.workspaceId &&
    snapshot.scope.type === "workspace" &&
    snapshot.period.cadence === "daily" &&
    snapshot.period.timezone === "UTC" &&
    snapshot.period.startedAt.toISOString() ===
      `${binding.requestedUtcDate}T00:00:00.000Z` &&
    snapshot.period.endedAt.toISOString() === nextUtcDate(binding.requestedUtcDate);
};

const nextUtcDate = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString();

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const isExactIso = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const readerSummaryArtifactWhere = (
  query: ListReaderSummaryArtifactsQuery,
) => ({
  tenantId: query.tenantId,
  workspaceId: query.workspaceId,
  scopeKey:
    query.scope === undefined ? undefined : readerSummaryScopeKey(query.scope),
  cadence: query.cadence,
  periodStartedAt: periodStartedAtWhere(query),
  periodEndedAt: query.periodEndedAt,
  periodTimezone: query.timezone,
  status: { in: VISIBLE_READER_SUMMARY_STATUSES },
  publication: currentPublicationFilter,
});

const currentPublicationFilter = {
  is: { activeSlot: { isNot: null } },
} as const;

const periodSummaryFromPrisma = (
  record: PrismaReaderSummaryPeriodSummaryRecord,
): ReaderSummaryPeriodSummary => ({
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  readerSummaryId: record.id,
  scope: readerSummaryScopeFromPrisma(record),
  period: buildReaderSummaryPeriod({
    cadence: record.cadence as ReaderSummaryCadence,
    startedAt: record.periodStartedAt,
    endedAt: record.periodEndedAt,
    timezone: record.periodTimezone,
  }),
  headline: record.headline,
  status: record.status === "NO_SIGNAL" ? "no_signal" : "completed",
  userId: record.userId ?? undefined,
  subscriptionId: record.subscriptionId ?? undefined,
});

const rejectedDebugFromPrisma = (
  record: PrismaReaderSummaryArtifactRecord,
): ReaderSummaryRejectedArtifactDebug => {
  const artifact = readerSummaryArtifactFromPrisma(record);
  const snapshot = artifact.toSnapshot();
  const publicationDecision = publicationDecisionFromQualitySignals(
    record.qualitySignals,
  );

  return {
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    readerSummaryId: snapshot.readerSummaryId,
    scope: snapshot.scope,
    period: snapshot.period,
    headline: snapshot.headline,
    canonicalScore: publicationDecision?.canonicalScore ?? 0,
    shadow: shadowReportFromDecision(publicationDecision),
    reasonCodes:
      publicationDecision?.status === "rejected"
        ? publicationDecision.reasonCodes
        : [],
    reasons: publicationDecision?.reasons ?? [],
    violations: rejectionViolationsFromDecision(publicationDecision),
    topReads: rejectedDebugTopReads(snapshot),
    citations: snapshot.citationMap.map((citation) => ({
      citationId: citation.citationId,
      feedItemId: citation.feedItemId,
      sourceItemId: citation.sourceItemId,
      providerKey: citation.providerKey,
      canonicalUrl: citation.canonicalUrl,
    })),
  };
};

const rejectedDebugTopReads = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): ReaderSummaryRejectedArtifactDebug["topReads"] => {
  const contentTopReads = snapshot.content?.topReads;
  if (contentTopReads !== undefined && contentTopReads.length > 0) {
    return contentTopReads.map((item) => ({
      title: item.title,
      providerKey: item.providerKey,
      canonicalUrl: item.canonicalUrl,
      citationIds: item.citationIds,
    }));
  }

  const citationById = new Map(
    snapshot.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );

  return snapshot.topStories.map((item) => ({
    title: item.title,
    providerKey: item.providerKeys[0],
    canonicalUrl: firstCanonicalUrl(item.citationIds, citationById),
    citationIds: item.citationIds,
  }));
};

const firstCanonicalUrl = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<
    string,
    ReturnType<ReaderSummaryArtifact["toSnapshot"]>["citationMap"][number]
  >,
): string | undefined => {
  for (const citationId of citationIds) {
    const canonicalUrl = citationById.get(citationId)?.canonicalUrl;
    if (canonicalUrl !== undefined) {
      return canonicalUrl;
    }
  }

  return undefined;
};

const rejectionViolationsFromDecision = (
  publicationDecision:
    ReaderSummaryPublicationDecisionForPersistence | undefined,
): ReaderSummaryRejectedArtifactDebug["violations"] => {
  if (publicationDecision?.status !== "rejected") {
    return [];
  }

  const findings = publicationDecisionFindings(publicationDecision);

  if (findings.length > 0) {
    return findings.map((finding) => ({
      code: finding.code,
      reason: finding.reason,
      topReadTitle: finding.topReadTitle,
      citationId: finding.citationId,
      feedItemId: finding.feedItemId,
      sourceItemId: finding.sourceItemId,
      providerKey: finding.providerKey,
      canonicalUrl: finding.canonicalUrl,
    }));
  }

  return publicationDecision.reasons.map((reason, index) => ({
    code: publicationDecision.reasonCodes[index] ?? "technical_leakage",
    reason,
  }));
};

const publicationDecisionFindings = (
  publicationDecision: ReaderSummaryPublicationDecisionForPersistence,
): ReaderSummaryRejectedArtifactDebug["violations"] =>
  "findings" in publicationDecision &&
  Array.isArray(publicationDecision.findings)
    ? publicationDecision.findings
    : [];

const publicationDecisionFromQualitySignals = (
  qualitySignals: unknown,
): ReaderSummaryPublicationDecisionForPersistence | undefined => {
  if (
    typeof qualitySignals !== "object" ||
    qualitySignals === null ||
    !("publicationDecision" in qualitySignals)
  ) {
    return undefined;
  }

  const decision = qualitySignals.publicationDecision;
  if (
    typeof decision !== "object" ||
    decision === null ||
    !("status" in decision) ||
    !("canonicalScore" in decision) ||
    !("reasons" in decision)
  ) {
    return undefined;
  }

  return decision as ReaderSummaryPublicationDecisionForPersistence;
};

const shadowReportFromDecision = (
  publicationDecision:
    ReaderSummaryPublicationDecisionForPersistence | undefined,
): ReaderSummaryRejectedArtifactDebug["shadow"] => {
  const shadow =
    publicationDecision !== undefined && "shadow" in publicationDecision
      ? publicationDecision.shadow
      : undefined;

  return {
    mode: "shadow",
    riskScore: shadow?.riskScore ?? 0,
    signals: shadow?.signals ?? [],
  };
};
const periodStartedAtWhere = (query: ListReaderSummaryArtifactsQuery) => {
  if (
    query.periodStartedAt === undefined &&
    query.periodStartedFrom === undefined &&
    query.periodStartedBefore === undefined
  ) {
    return undefined;
  }

  if (
    query.periodStartedFrom === undefined &&
    query.periodStartedBefore === undefined
  ) {
    return query.periodStartedAt;
  }

  return {
    equals: query.periodStartedAt,
    gte: query.periodStartedFrom,
    lt: query.periodStartedBefore,
  };
};
