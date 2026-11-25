import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
  type ReaderSummaryCadence,
} from "../../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryPeriodSummary,
  ReaderSummaryRejectedArtifactDebug,
} from "../../../ports";
import { readerSummaryScopeFromPrisma } from "./prisma-reader-summary-artifact-payload";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  readerSummaryArtifactFromPrisma,
  type PrismaReaderSummaryArtifactRecord,
  type PrismaReaderSummaryPeriodSummaryRecord,
} from "./prisma-reader-summary-records";
import { encodeSummaryCursor, parseSummaryCursor } from "./prisma-summary-records";

const VISIBLE_READER_SUMMARY_STATUSES = ["COMPLETED"] as const;
const READER_SUMMARY_ORDER = [
  { periodStartedAt: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
] as const;

type ReaderSummaryPublicationDecisionForPersistence = NonNullable<
  NonNullable<
    Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1]
  >["publicationDecision"]
>;

export const currentReaderSummaryPublicationFilter = {
  is: { activeSlot: { isNot: null } },
} as const;

export const listCompatibleReaderSummaryArtifacts = async (
  prisma: PrismaSummaryClient,
  query: ListReaderSummaryArtifactsQuery,
): Promise<ListReaderSummaryArtifactsResult> => {
  const offset = parseSummaryCursor(query.cursor);
  const where = readerSummaryArtifactWhere(query);
  const items: ReaderSummaryArtifact[] = [];
  let scannedOffset = offset;
  const total = await prisma.readerSummaryArtifact.count({ where });

  while (scannedOffset < total && items.length < query.limit) {
    const records = await prisma.readerSummaryArtifact.findMany({
      where,
      orderBy: READER_SUMMARY_ORDER,
      skip: scannedOffset,
      take: query.limit,
    });
    if (records.length === 0) break;

    for (const record of records) {
      scannedOffset += 1;
      const artifact = compatibleReaderSummaryArtifact(record);
      if (artifact !== undefined) items.push(artifact);
      if (items.length === query.limit) break;
    }
  }

  return {
    items,
    nextCursor:
      scannedOffset < total ? encodeSummaryCursor(scannedOffset) : undefined,
  };
};

export const listReaderSummaryPeriodSummaries = async (
  prisma: PrismaSummaryClient,
  query: ListReaderSummaryArtifactsQuery,
): Promise<ListReaderSummaryPeriodSummariesResult> => {
  const offset = parseSummaryCursor(query.cursor);
  const where = readerSummaryArtifactWhere(query);
  const [records, total] = await Promise.all([
    prisma.readerSummaryArtifact.findMany({
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
      orderBy: READER_SUMMARY_ORDER,
      skip: offset,
      take: query.limit,
    }),
    prisma.readerSummaryArtifact.count({ where }),
  ]);
  const items = records.map(periodSummaryFromPrisma);
  const nextOffset = offset + items.length;

  return {
    items,
    nextCursor:
      nextOffset < total ? encodeSummaryCursor(nextOffset) : undefined,
  };
};

export const rejectedReaderSummaryDebugFromPrisma = (
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
  publication: currentReaderSummaryPublicationFilter,
});

const compatibleReaderSummaryArtifact = (
  record: PrismaReaderSummaryArtifactRecord,
): ReaderSummaryArtifact | undefined => {
  try {
    return readerSummaryArtifactFromPrisma(record);
  } catch {
    return undefined;
  }
};

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
    if (canonicalUrl !== undefined) return canonicalUrl;
  }
  return undefined;
};

const rejectionViolationsFromDecision = (
  publicationDecision:
    ReaderSummaryPublicationDecisionForPersistence | undefined,
): ReaderSummaryRejectedArtifactDebug["violations"] => {
  if (publicationDecision?.status !== "rejected") return [];

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
  ) return undefined;

  const decision = qualitySignals.publicationDecision;
  if (
    typeof decision !== "object" ||
    decision === null ||
    !("status" in decision) ||
    !("canonicalScore" in decision) ||
    !("reasons" in decision)
  ) return undefined;

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
  ) return undefined;

  if (
    query.periodStartedFrom === undefined &&
    query.periodStartedBefore === undefined
  ) return query.periodStartedAt;

  return {
    equals: query.periodStartedAt,
    gte: query.periodStartedFrom,
    lt: query.periodStartedBefore,
  };
};
