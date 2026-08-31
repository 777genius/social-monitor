import {
  readerPostProviderFamily,
} from "../policies/reader-post-promotion-policy";
import type { ReaderPostPromotionSelection } from
  "../policies/reader-post-promotion-selection";
import {
  READER_SUMMARY_EDITORIAL_SLATE_VERSION,
  type ReaderSummaryEditorialScoreComponents,
  type ReaderSummaryEditorialSlate,
  type ReaderSummaryEditorialSlateEntry,
} from "../value-objects/reader-summary-editorial-slate";
import type { SummarySourceWindow } from
  "../value-objects/summary-evidence-item";
import {
  buildReaderPostPromotionAttestations,
  type ReaderPostPromotionAttestationBinding,
} from "./reader-post-promotion-attestation";

type BindingWithoutSlate = Omit<
  ReaderPostPromotionAttestationBinding,
  "editorialSlate"
>;

export const bindReaderPromotionV2TestSelection = (
  selection: ReaderPostPromotionSelection,
  binding: BindingWithoutSlate,
): Readonly<{
  selection: ReaderPostPromotionSelection;
  editorialSlate: ReaderSummaryEditorialSlate;
}> => {
  const top = selection.top.map((selected, index) => testEntry(
    selected.candidate,
    "top",
    index + 1,
  ));
  const additional = selection.additional.map((selected, index) => testEntry(
    selected.candidate,
    "additional",
    index + 1,
  ));
  const entries = [...top, ...additional];
  const digestInputs = entries.map((entry) => entry.digestInput);
  const editorialSlate: ReaderSummaryEditorialSlate = {
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    top,
    additional,
    excluded: [],
    orderedCandidateIds: entries.map((entry) => entry.candidateId),
    orderedCanonicalIdentities: entries.map(
      (entry) => entry.canonicalIdentity,
    ),
    digestInputs,
    digestMaterial: slateDigestMaterial(
      binding.sourceWindow,
      entries,
      digestInputs,
    ),
  };
  const entryByCandidateId = new Map(entries.map((entry) =>
    [entry.candidateId, entry] as const));
  return {
    editorialSlate,
    selection: {
      ...selection,
      top: selection.top.map((selected) => ({
        ...selected,
        editorialSlateEntry: entryByCandidateId.get(
          selected.candidate.candidateId,
        )!,
      })),
      additional: selection.additional.map((selected) => ({
        ...selected,
        editorialSlateEntry: entryByCandidateId.get(
          selected.candidate.candidateId,
        )!,
      })),
    },
  };
};

export const buildReaderPromotionV2TestAttestations = (
  selection: ReaderPostPromotionSelection,
  binding: BindingWithoutSlate,
) => {
  const bound = bindReaderPromotionV2TestSelection(selection, binding);
  return buildReaderPostPromotionAttestations(bound.selection, {
    ...binding,
    editorialSlate: bound.editorialSlate,
  });
};

const testEntry = (
  input: ReaderPostPromotionSelection["top"][number]["candidate"],
  placement: "top" | "additional",
  slot: number,
): ReaderSummaryEditorialSlateEntry => {
  const providerFamily = readerPostProviderFamily(input.provider);
  if (providerFamily === undefined) {
    throw new Error("Test promotion provider must be supported");
  }
  const scoreComponents = testScoreComponents();
  const reasonCodes = ["reader_promotion_v2_test_fixture"];
  const candidateDigestInput = JSON.stringify({
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    candidateId: input.candidateId,
    canonicalIdentity: input.canonicalIdentity,
    provider: providerFamily === "github_radar" ? "github" : providerFamily,
  });
  const body = {
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    placement,
    slot,
    candidateId: input.candidateId,
    canonicalIdentity: input.canonicalIdentity,
    provider: providerFamily === "github_radar" ? "github" as const : providerFamily,
    storyClusterId: input.clusterId ?? `promotion:${input.canonicalIdentity}`,
    scoreComponents,
    reasonCodes,
    candidateDigestInput,
  };
  return { ...body, digestInput: JSON.stringify(body) };
};

const testScoreComponents = (): ReaderSummaryEditorialScoreComponents => ({
  engagementSalience: 1,
  relevance: 1,
  evidenceQuality: 1,
  integrity: 1,
  freshness: 1,
  weightedEngagement: 0.35,
  weightedRelevance: 0.25,
  weightedEvidenceQuality: 0.2,
  weightedIntegrity: 0.1,
  weightedFreshness: 0.1,
  total: 1,
});

const slateDigestMaterial = (
  sourceWindow: SummarySourceWindow,
  entries: readonly ReaderSummaryEditorialSlateEntry[],
  digestInputs: readonly string[],
): string => {
  const periodStartedAt = sourceWindow.periodStartedAt ?? sourceWindow.startedAt;
  const periodEndedAt = sourceWindow.periodEndedAt ?? sourceWindow.endedAt;
  const ingestionCutoff = sourceWindow.ingestionCutoff ?? sourceWindow.endedAt;
  return JSON.stringify({
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    sourceWindow: {
      windowId: sourceWindow.windowId,
      startedAt: sourceWindow.startedAt.toISOString(),
      endedAt: sourceWindow.endedAt.toISOString(),
      periodStartedAt: periodStartedAt.toISOString(),
      periodEndedAt: periodEndedAt.toISOString(),
      ingestionCutoff: ingestionCutoff.toISOString(),
    },
    orderedCandidateIds: entries.map((entry) => entry.candidateId),
    orderedCanonicalIdentities: entries.map(
      (entry) => entry.canonicalIdentity,
    ),
    digestInputs,
  });
};
