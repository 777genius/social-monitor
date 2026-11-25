import type {
  ReaderSummaryCadence,
  ReaderSummaryContextArtifact,
} from "../../domain";
import {
  NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  type BuildReaderSummaryContextQuery,
  type ReaderSummaryArtifactRepositoryPort,
  type ReaderSummaryContextProviderPort,
} from "../../ports";

export class ReaderSummaryArtifactContextProvider implements ReaderSummaryContextProviderPort {
  constructor(
    private readonly readerSummaries: ReaderSummaryArtifactRepositoryPort,
    private readonly delegate: ReaderSummaryContextProviderPort = NOOP_READER_SUMMARY_CONTEXT_PROVIDER,
  ) {}

  async buildContext(
    query: BuildReaderSummaryContextQuery,
  ): Promise<readonly ReaderSummaryContextArtifact[]> {
    const [periodArtifacts, delegatedArtifacts] = await Promise.all([
      this.buildPeriodContext(query),
      this.delegate.buildContext(query),
    ]);

    return dedupeContextArtifacts([...periodArtifacts, ...delegatedArtifacts]);
  }

  private async buildPeriodContext(
    query: BuildReaderSummaryContextQuery,
  ): Promise<readonly ReaderSummaryContextArtifact[]> {
    const cadence = contextCadenceFor(query.period.cadence);
    if (cadence === undefined) {
      return [];
    }

    const result = await this.readerSummaries.list({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      scope: query.scope,
      cadence,
      periodStartedFrom: query.period.startedAt,
      periodStartedBefore: query.period.endedAt,
      timezone: query.period.timezone,
      limit: contextArtifactLimitFor(query.period.cadence),
    });

    return result.items
      .map((artifact) => artifact.toSnapshot())
      .reverse()
      .map((snapshot) => ({
        artifactId: snapshot.readerSummaryId,
        scope: snapshot.scope,
        period: snapshot.period,
        summaryText: snapshot.executiveSummary,
        generatedAt: snapshot.sourceWindow.endedAt,
        freshness: "unknown" as const,
      }));
  }
}

const contextCadenceFor = (
  cadence: ReaderSummaryCadence,
): ReaderSummaryCadence | undefined => {
  if (cadence === "weekly" || cadence === "custom") {
    return "daily";
  }

  if (cadence === "monthly") {
    return "weekly";
  }

  return undefined;
};

const contextArtifactLimitFor = (cadence: ReaderSummaryCadence): number => {
  if (cadence === "weekly") {
    return 7;
  }

  if (cadence === "monthly") {
    return 6;
  }

  return 32;
};

const dedupeContextArtifacts = (
  artifacts: readonly ReaderSummaryContextArtifact[],
): readonly ReaderSummaryContextArtifact[] => {
  const seen = new Set<string>();
  const deduped: ReaderSummaryContextArtifact[] = [];

  for (const artifact of artifacts) {
    if (seen.has(artifact.artifactId)) {
      continue;
    }

    seen.add(artifact.artifactId);
    deduped.push(artifact);
  }

  return deduped;
};
