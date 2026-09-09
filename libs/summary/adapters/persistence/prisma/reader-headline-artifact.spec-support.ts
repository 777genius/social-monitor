import type { SummaryEvidenceItem } from "../../../domain";
import { ReaderSummaryArtifact } from "../../../domain";
import { readerSummaryArtifact } from "./prisma-reader-summary-artifact-fixture.spec-support";
import { assessedSource } from "../../evidence/reader-headline.spec-support";
import { project } from "../../evidence/reader-summary-faithful-source.spec-support";
import { selection, storyCluster } from "../../evidence/reader-summary-editorial-slate.spec-support";

export const headlineArtifactProps = (lead: SummaryEvidenceItem = assessedSource()) => {
  const base = readerSummaryArtifact("faithful-source-fixture").toSnapshot();
  const projection = project([lead]);
  const evidence = selection([lead], [storyCluster(lead.feedItemId, [lead])]);
  const props = {
    ...base,
    period: { ...base.period, startedAt: evidence.sourceWindow.startedAt,
      endedAt: evidence.sourceWindow.endedAt,
      periodKey: `daily:${evidence.sourceWindow.startedAt.toISOString()}:${evidence.sourceWindow.endedAt.toISOString()}:UTC` },
    sourceWindow: evidence.sourceWindow,
    storyClusters: projection.admittedClusters,
    citationMap: projection.admittedCitations,
    promotionAttestations: projection.attestations,
    promotionEvidenceFacts: projection.attestedEvidenceFacts,
    topStories: [{ ...base.topStories[0]!, storyClusterId: projection.admittedClusters[0]!.id,
      citationIds: projection.topReads[0]!.citationIds }],
    content: { ...base.content!, topReads: projection.topReads, selectedPosts: projection.additionalPosts,
      sourceMix: [{ ...base.content!.sourceMix[0]!, providerKey: lead.providerKey,
        interestIds: [lead.interestId] }] },
  };
  return { props, evidence };
};
export const headlineArtifact = (lead: SummaryEvidenceItem = assessedSource()) =>
  ReaderSummaryArtifact.create(headlineArtifactProps(lead).props);
export const headlineFallback = (artifact: ReaderSummaryArtifact) => {
  const snapshot = artifact.toSnapshot();
  return { id: snapshot.readerSummaryId, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
    scopeType: "workspace", interestId: null, cadence: "daily",
    periodStartedAt: snapshot.period.startedAt, periodEndedAt: snapshot.period.endedAt,
    periodTimezone: "UTC", userId: null, subscriptionId: null, headline: snapshot.headline,
    summaryText: snapshot.executiveSummary, createdAt: snapshot.period.endedAt };
};
