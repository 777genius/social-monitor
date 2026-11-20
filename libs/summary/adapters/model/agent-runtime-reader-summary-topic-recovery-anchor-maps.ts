import type { ReaderSummaryTopicNodeLabel } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { indexUniqueReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-index";
import { anchorKeys } from "./agent-runtime-reader-summary-topic-anchor-token-policy";

/** Evidence-to-node projection, separate from token admission and group mutation. */
export const groundedNodeAnchors = (
  label: ReaderSummaryTopicNodeLabel,
  candidate: ReaderSummaryTopicLabelerInput["candidates"][number] | undefined,
): ReadonlySet<string> =>
  new Set(
    [
      label.label,
      label.semantic?.parentSubject,
      ...(label.keywords ?? []),
      candidate?.fallbackLabel,
      ...(candidate?.keywords ?? []),
      ...(candidate?.labelCandidates.map((item) => item.label) ?? []),
    ].flatMap((value) => (value === undefined ? [] : anchorKeys(value))),
  );

export const identityAnchors = (
  label: ReaderSummaryTopicNodeLabel,
): ReadonlySet<string> =>
  new Set(
    [
      label.label,
      label.semantic?.subject,
      label.semantic?.parentSubject,
      label.semantic?.qualifier,
    ].flatMap((value) => (value === undefined ? [] : anchorKeys(value))),
  );

/** Keep candidate evidence anchoring separate from cohort assignment and mutation. */
export const buildGroundedTopicRecoveryAnchorMaps = (params: {
  readonly nodeLabels: readonly ReaderSummaryTopicNodeLabel[];
  readonly candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][];
}) => {
  const candidateByNodeId = indexUniqueReaderSummaryTopicCandidates(params.candidates);
  const anchorsByNodeId = new Map(
    params.nodeLabels.map((label) => [
      label.nodeId,
      groundedNodeAnchors(label, candidateByNodeId.get(label.nodeId)),
    ]),
  );
  const identityAnchorsByNodeId = new Map(
    params.nodeLabels.map((label) => [label.nodeId, identityAnchors(label)]),
  );
  return { candidateByNodeId, anchorsByNodeId, identityAnchorsByNodeId };
};

