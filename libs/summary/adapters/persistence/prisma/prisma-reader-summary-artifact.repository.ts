import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
  type ReaderSummaryCadence,
} from "../../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  ReaderSummaryPeriodSummary,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryRejectedArtifactDebug,
  ReaderSummaryWeeklyArtifactRepositoryPort,
  SaveReaderSummaryWeeklyArtifactCommand,
} from "../../../ports";
import { buildReaderSummaryWeeklyPublicationPersistencePayload } from "../reader-summary-publication-proof";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaReaderSummaryArtifactCreate } from "./prisma-reader-summary-client";
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

const VISIBLE_READER_SUMMARY_STATUSES = ["COMPLETED"] as const;
const PUBLISHED_READER_SUMMARY_STATUSES = [
  ...VISIBLE_READER_SUMMARY_STATUSES,
  "NO_SIGNAL",
] as const;

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
    const existing = await this.prisma.readerSummaryArtifact.findFirst({
      where: {
        id: snapshot.readerSummaryId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
      },
    });
    if (existing !== null) {
      return;
    }
    const publicationDecision = options?.publicationDecision;
    const githubProjectionVerified = readerSummaryHasVerifiedGitHubProjection({
      artifact,
      audit: options?.githubProjectionAudit,
    });
    const status: PrismaSummaryStatus =
      publicationDecision?.status === "rejected" || !githubProjectionVerified
        ? "REJECTED"
        : "RUNNING";
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
      this.prisma.readerSummaryArtifact.upsert({
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
    const payload = buildReaderSummaryWeeklyPublicationPersistencePayload(command);
    const existing = await this.prisma.readerSummaryArtifact.findFirst({
      where: { id: payload.artifactId, tenantId: payload.tenantId,
        workspaceId: payload.workspaceId },
    });
    if (existing !== null) throw weeklyAuthorizationReplay();
    const data: PrismaReaderSummaryArtifactCreate = {
      id: payload.artifactId, tenantId: payload.tenantId,
      workspaceId: payload.workspaceId, schemaVersion: 1,
      ...readerSummaryScopeToPrisma(payload.scope), cadence: "weekly",
      periodStartedAt: new Date(payload.periodStartedAt),
      periodEndedAt: new Date(payload.periodEndedAt), periodTimezone: "UTC",
      periodKey: payload.periodKey, status: "RUNNING", userId: null,
      subscriptionId: null, modelVersion: payload.modelVersion,
      promptVersion: payload.promptVersion, headline: payload.headline,
      summaryText: payload.summaryText, artifactPayload: payload.artifactPayload,
      citations: payload.citations, qualitySignals: {
        ...payload.qualitySignals, weeklyPublicationProof: payload.proof,
      },
    };
    try {
      const creator = this.prisma.readerSummaryArtifact as unknown as {
        create(args: { readonly data: PrismaReaderSummaryArtifactCreate }): Promise<PrismaReaderSummaryArtifactRecord>;
      };
      await withPrismaWriteRetry(() => creator.create({ data }));
    } catch (error: unknown) {
      if (isPrismaUniqueConstraint(error)) throw weeklyAuthorizationReplay();
      throw error;
    }
  }
}

const isPrismaUniqueConstraint = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  error.code === "P2002";
const weeklyAuthorizationReplay = (): Error => new Error(
  "Reader summary weekly publication authorization was replayed");

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
