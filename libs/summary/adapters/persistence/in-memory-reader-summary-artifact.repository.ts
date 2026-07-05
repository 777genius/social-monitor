import {
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
} from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryRejectedArtifactDebug,
} from "../../ports";

type ReaderSummaryPublicationDecisionForPersistence = NonNullable<
  NonNullable<
    Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1]
  >["publicationDecision"]
>;

export class InMemoryReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, ReaderSummaryArtifact>();
  private readonly statusesById = new Map<string, ReaderSummaryArtifactVisibility>();
  private readonly publicationDecisionsById = new Map<
    string,
    ReaderSummaryPublicationDecisionForPersistence
  >();

  async save(
    artifact: ReaderSummaryArtifact,
    options?: Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1],
  ): Promise<void> {
    const snapshot = artifact.toSnapshot();
    const key = artifactKey(snapshot);
    const visibility =
      options?.publicationDecision?.status === "rejected"
        ? "rejected"
        : "visible";

    if (visibility === "visible") {
      this.supersedeMatchingVisibleArtifacts(snapshot, key);
    }

    this.artifactsById.set(key, artifact);
    this.statusesById.set(key, visibility);
    if (options?.publicationDecision !== undefined) {
      this.publicationDecisionsById.set(key, options.publicationDecision);
    }
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.artifactsById.values()]
      .filter((artifact) => {
        const snapshot = artifact.toSnapshot();
        const key = artifactKey(snapshot);

        return (
          this.statusesById.get(key) === "visible" &&
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.scope === undefined ||
            readerSummaryScopeKey(snapshot.scope) ===
              readerSummaryScopeKey(query.scope)) &&
          (query.cadence === undefined ||
            snapshot.period.cadence === query.cadence) &&
          (query.periodStartedAt === undefined ||
            snapshot.period.startedAt.getTime() ===
              query.periodStartedAt.getTime()) &&
          (query.periodStartedFrom === undefined ||
            snapshot.period.startedAt.getTime() >=
              query.periodStartedFrom.getTime()) &&
          (query.periodStartedBefore === undefined ||
            snapshot.period.startedAt.getTime() <
              query.periodStartedBefore.getTime()) &&
          (query.periodEndedAt === undefined ||
            snapshot.period.endedAt.getTime() ===
              query.periodEndedAt.getTime()) &&
          (query.timezone === undefined ||
            snapshot.period.timezone === query.timezone)
        );
      })
      .sort(compareReaderSummaryArtifacts);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async listPeriodSummaries(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryPeriodSummariesResult> {
    const result = await this.list(query);

    return {
      items: result.items.map((artifact) => {
        const snapshot = artifact.toSnapshot();

        return {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          readerSummaryId: snapshot.readerSummaryId,
          scope: snapshot.scope,
          period: snapshot.period,
          headline: snapshot.headline,
          status: snapshot.qualityFlags.includes("no_signal")
            ? "no_signal"
            : "completed",
          userId: snapshot.userId,
          subscriptionId: snapshot.subscriptionId,
        };
      }),
      nextCursor: result.nextCursor,
    };
  }

  async findById(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryArtifact | null> {
    const key = `${params.tenantId}:${params.workspaceId}:${params.readerSummaryId}`;

    if (this.statusesById.get(key) === "rejected") {
      return null;
    }

    return this.artifactsById.get(key) ?? null;
  }

  async findRejectedDebugById(
    params: Parameters<
      ReaderSummaryArtifactRepositoryPort["findRejectedDebugById"]
    >[0],
  ): Promise<ReaderSummaryRejectedArtifactDebug | null> {
    const key = `${params.tenantId}:${params.workspaceId}:${params.readerSummaryId}`;
    const artifact = this.artifactsById.get(key);
    if (artifact === undefined || this.statusesById.get(key) !== "rejected") {
      return null;
    }

    return rejectedDebugFromArtifact(
      artifact,
      this.publicationDecisionsById.get(key),
    );
  }

  all(): readonly ReaderSummaryArtifact[] {
    return [...this.artifactsById.values()];
  }

  private supersedeMatchingVisibleArtifacts(
    snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
    currentKey: string,
  ): void {
    for (const [key, artifact] of this.artifactsById.entries()) {
      if (key === currentKey || this.statusesById.get(key) !== "visible") {
        continue;
      }

      if (sameReaderSummaryCanonicalSlot(artifact.toSnapshot(), snapshot)) {
        this.statusesById.set(key, "superseded");
      }
    }
  }
}

type ReaderSummaryArtifactVisibility = "visible" | "rejected" | "superseded";

const rejectedDebugFromArtifact = (
  artifact: ReaderSummaryArtifact,
  publicationDecision: ReaderSummaryPublicationDecisionForPersistence | undefined,
): ReaderSummaryRejectedArtifactDebug => {
  const snapshot = artifact.toSnapshot();

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
    snapshot.citationMap.map((citation) => [
      citation.citationId,
      citation,
    ] as const),
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
  publicationDecision: ReaderSummaryPublicationDecisionForPersistence | undefined,
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
  "findings" in publicationDecision && Array.isArray(publicationDecision.findings)
    ? publicationDecision.findings
    : [];

const shadowReportFromDecision = (
  publicationDecision: ReaderSummaryPublicationDecisionForPersistence | undefined,
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

const artifactKey = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): string =>
  `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.readerSummaryId}`;

const sameReaderSummaryCanonicalSlot = (
  left: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
  right: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): boolean =>
  left.tenantId === right.tenantId &&
  left.workspaceId === right.workspaceId &&
  readerSummaryScopeKey(left.scope) === readerSummaryScopeKey(right.scope) &&
  left.period.cadence === right.period.cadence &&
  left.period.startedAt.getTime() === right.period.startedAt.getTime() &&
  left.period.endedAt.getTime() === right.period.endedAt.getTime() &&
  left.period.timezone === right.period.timezone;

const compareReaderSummaryArtifacts = (
  left: ReaderSummaryArtifact,
  right: ReaderSummaryArtifact,
): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const completedWindowDiff =
    rightSnapshot.period.startedAt.getTime() -
    leftSnapshot.period.startedAt.getTime();

  if (completedWindowDiff !== 0) {
    return completedWindowDiff;
  }

  return rightSnapshot.readerSummaryId.localeCompare(
    leftSnapshot.readerSummaryId,
  );
};

const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString("base64url");

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { offset?: unknown };

    if (
      typeof parsed.offset === "number" &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
