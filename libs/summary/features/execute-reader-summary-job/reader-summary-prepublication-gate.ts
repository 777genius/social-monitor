import {
  evaluateReaderSummaryGitHubProjection,
  exactUtcDay,
  notApplicableReaderSummaryGitHubProjectionAudit,
  unavailableReaderSummaryGitHubProjectionAudit,
  withReaderSummaryPublicationRejections,
  type ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
  type ReaderSummaryGitHubProjectionEvaluation,
  type ReaderSummaryPublicationDecision,
  type ReaderSummaryPublicationPolicy,
  type SummaryEvidenceSelection,
} from "../../domain";
import type { ReaderSummaryGitHubProjectionReaderPort } from "../../ports";

export type ReaderSummaryPrepublicationDecision = {
  readonly publicationDecision: ReaderSummaryPublicationDecision;
  readonly githubProjectionAudit: ReaderSummaryGitHubProjectionAudit;
};

export const evaluateReaderSummaryPrepublication = async (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly evidence: SummaryEvidenceSelection;
  readonly publicationPolicy: ReaderSummaryPublicationPolicy;
  readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  readonly observedThrough: Date;
}): Promise<ReaderSummaryPrepublicationDecision> => {
  const publicationDecision = params.publicationPolicy.evaluate({
    artifact: params.artifact,
    evidence: params.evidence,
  });
  const snapshot = params.artifact.toSnapshot();
  let projection: ReaderSummaryGitHubProjectionEvaluation;
  if (
    exactUtcDay(
      snapshot.period.startedAt,
      snapshot.period.endedAt,
      snapshot.period.timezone,
    ) === undefined
  ) {
    projection = notApplicableReaderSummaryGitHubProjectionAudit({
      artifact: params.artifact,
    });
  } else {
    try {
      const durable = await params.githubProjectionReader.read({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        dayStartedAt: snapshot.period.startedAt,
        dayEndedAt: snapshot.period.endedAt,
        observedThrough: params.observedThrough,
      });
      projection = evaluateReaderSummaryGitHubProjection({
        artifact: params.artifact,
        eligibleBindingIds: durable.eligibleBindingIds,
        items: durable.items,
        pageCount: durable.pageCount,
        observedThrough: params.observedThrough,
      });
    } catch {
      projection = unavailableReaderSummaryGitHubProjectionAudit({
        artifact: params.artifact,
        reason:
          "Durable GitHub projection could not be read before publication.",
      });
    }
  }

  return {
    publicationDecision: withReaderSummaryPublicationRejections({
      decision: publicationDecision,
      findings: projection.findings,
    }),
    githubProjectionAudit: projection.audit,
  };
};
