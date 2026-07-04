import type {
  ReaderSummaryContent,
  ReaderSummaryItem,
} from "./reader-summary-artifact";
import type { ReaderSummaryCitation } from "./citation";
import type { ReaderSummaryClaim } from "./reader-summary-claim";
import {
  assertUniqueReaderSummaryItems,
  assertUniqueReaderSummaryContentItems,
  assertUniqueReaderSummarySourceMixProviders,
} from "./reader-summary-content-identity";
import { assertReaderSummaryContentShape } from "./reader-summary-content-shape";

export const assertReaderSummaryContent = (
  content: ReaderSummaryContent,
  knownCitationIds: ReadonlySet<string>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  storyClusterProviderKeys: ReadonlySet<string>,
): void => {
  const knownProviderKeys = new Set([
    ...storyClusterProviderKeys,
    ...providerKeysFromCitations(citationById, knownCitationIds),
  ]);

  if (
    content.headline.trim().length === 0 ||
    content.oneLineTakeaway.trim().length === 0 ||
    content.bullets.some((bullet) => bullet.trim().length === 0)
  ) {
    throw new Error(
      "Reader summary content must include headline, takeaway and non-empty bullets",
    );
  }
  assertReaderSummaryContentShape(content);

  for (const source of content.sourceMix) {
    if (
      source.providerKey.trim().length === 0 ||
      source.itemCount < 0 ||
      source.citationCount < 0 ||
      source.storyClusterCount < 0 ||
      source.crossSourceClusterCount < 0
    ) {
      throw new Error(
        "Reader summary source mix entries must include provider and non-negative counts",
      );
    }
    if (!knownProviderKeys.has(source.providerKey)) {
      throw new Error(
        "Reader summary source mix includes provider outside evidence",
      );
    }
  }
  assertUniqueReaderSummarySourceMixProviders(content.sourceMix);

  if (
    content.qualityState.warnings.some((warning) => warning.trim().length === 0)
  ) {
    throw new Error("Reader summary quality state warnings must be non-empty");
  }
  for (const topic of content.mainTopics ?? []) {
    if (topic.trim().length === 0) {
      throw new Error("Reader summary main topics must be non-empty");
    }
  }
  assertReaderSummaryReliabilityReport(content.reliabilityReport);

  for (const section of content.interestSections) {
    if (
      section.title.trim().length === 0 ||
      section.insight.trim().length === 0
    ) {
      throw new Error(
        "Reader summary interest sections must include title and insight",
      );
    }
    assertCitationIds(
      section.citationIds,
      knownCitationIds,
      "Reader summary interest section",
    );
    for (const item of section.items) {
      assertReaderItem(
        item,
        knownCitationIds,
        citationById,
        knownProviderKeys,
        "Reader summary interest item",
      );
    }
  }
  for (const item of content.topReads) {
    assertReaderItem(
      item,
      knownCitationIds,
      citationById,
      knownProviderKeys,
      "Reader summary top read",
    );
  }
  for (const item of content.selectedPosts ?? []) {
    assertReaderItem(
      item,
      knownCitationIds,
      citationById,
      knownProviderKeys,
      "Reader summary selected post",
    );
  }
  assertUniqueReaderSummaryItems(
    content.selectedPosts ?? [],
    "Reader summary selected posts",
    citationById,
  );
  for (const claim of content.claimBoard) {
    assertReaderSummaryClaim(claim, knownCitationIds, knownProviderKeys);
  }
  assertUniqueReaderSummaryContentItems(content, citationById);

  for (const action of content.nextActions) {
    if (action.label.trim().length === 0 || action.reason.trim().length === 0) {
      throw new Error(
        "Reader summary next actions must include label and reason",
      );
    }
    assertCitationIds(
      action.citationIds,
      knownCitationIds,
      "Reader summary next action",
    );
  }
};

const assertReaderSummaryReliabilityReport = (
  report: ReaderSummaryContent["reliabilityReport"],
): void => {
  if (
    report.mode !== "shadow" ||
    report.policyVersion.trim().length === 0 ||
    !["low", "medium", "high"].includes(report.riskLevel) ||
    !Number.isFinite(report.riskScore) ||
    report.riskScore < 0 ||
    report.riskScore > 1
  ) {
    throw new Error(
      "Reader summary reliability report must include shadow mode and bounded risk score",
    );
  }

  for (const risk of report.risks) {
    if (
      ![
        "duplicate_risk",
        "stale_evidence",
        "single_source",
        "weak_source",
        "low_evidence_diversity",
      ].includes(risk.kind) ||
      !["low", "medium", "high"].includes(risk.level) ||
      !Number.isFinite(risk.score) ||
      risk.score < 0 ||
      risk.score > 1 ||
      risk.description.trim().length === 0
    ) {
      throw new Error(
        "Reader summary reliability risks must include kind, level and bounded score",
      );
    }
  }
};

const assertReaderSummaryClaim = (
  claim: ReaderSummaryClaim,
  knownCitationIds: ReadonlySet<string>,
  knownProviderKeys: ReadonlySet<string>,
): void => {
  if (
    claim.claim.trim().length === 0 ||
    claim.evidence.length === 0 ||
    claim.citationIds.length === 0 ||
    !["low", "medium", "high"].includes(claim.confidence.level) ||
    !Number.isFinite(claim.confidence.score) ||
    claim.confidence.score < 0 ||
    claim.confidence.score > 1 ||
    claim.confidence.rationale.trim().length === 0
  ) {
    throw new Error(
      "Reader summary claim board items must include claim, evidence and confidence",
    );
  }

  assertCitationIds(
    claim.citationIds,
    knownCitationIds,
    "Reader summary claim",
  );
  for (const evidence of claim.evidence) {
    if (
      evidence.title.trim().length === 0 ||
      evidence.providerKey.trim().length === 0 ||
      evidence.citationId.trim().length === 0
    ) {
      throw new Error("Reader summary claim evidence must be non-empty");
    }
    if (!knownProviderKeys.has(evidence.providerKey)) {
      throw new Error(
        "Reader summary claim evidence provider must exist in selected evidence",
      );
    }
    assertCitationIds(
      [evidence.citationId],
      knownCitationIds,
      "Reader summary claim evidence",
    );
  }

  for (const risk of claim.risks) {
    if (risk.description.trim().length === 0) {
      throw new Error("Reader summary claim risks must be non-empty");
    }
    if (
      !["single_source", "low_confidence", "unresolved"].includes(risk.kind)
    ) {
      throw new Error("Reader summary claim risk kind is unsupported");
    }
  }
};

const assertReaderItem = (
  item: ReaderSummaryItem,
  knownCitationIds: ReadonlySet<string>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  knownProviderKeys: ReadonlySet<string>,
  label: string,
): void => {
  if (
    item.title.trim().length === 0 ||
    item.providerKey.trim().length === 0 ||
    item.providerName.trim().length === 0 ||
    item.reason.trim().length === 0 ||
    item.whyNow.trim().length === 0 ||
    item.whyImportant.length === 0 ||
    item.matchedInterestIds.length === 0 ||
    item.matchedRules.length === 0 ||
    !Number.isFinite(item.signalScore) ||
    item.signalScore < 0 ||
    item.confirmedProviderKeys.length === 0 ||
    item.citationIds.length === 0 ||
    !Number.isFinite(item.confidence.score) ||
    item.confidence.score < 0 ||
    item.confidence.score > 1 ||
    item.confidence.rationale.trim().length === 0
  ) {
    throw new Error(`${label} must include title, provider and reason`);
  }
  if (!["low", "medium", "high"].includes(item.confidence.level)) {
    throw new Error(`${label} confidence level is unsupported`);
  }
  if (!["read_source", "watch_repository"].includes(item.primaryActionKind)) {
    throw new Error(`${label} primary action kind is unsupported`);
  }
  for (const metric of item.providerMetrics) {
    if (metric.label.trim().length === 0 || metric.value.trim().length === 0) {
      throw new Error(`${label} provider metrics must include label and value`);
    }
  }
  if (item.previewMedia !== undefined) {
    assertPreviewMedia(item.previewMedia, label);
  }
  assertCitationIds(item.citationIds, knownCitationIds, label);
  assertReaderItemProviderMatchesEvidence(
    item,
    citationById,
    knownProviderKeys,
    label,
  );
};

const assertReaderItemProviderMatchesEvidence = (
  item: ReaderSummaryItem,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  knownProviderKeys: ReadonlySet<string>,
  label: string,
): void => {
  const citationProviderKeys = new Set(
    item.citationIds
      .map((citationId) => citationById.get(citationId)?.providerKey)
      .filter(
        (providerKey): providerKey is string => providerKey !== undefined,
      ),
  );

  if (!citationProviderKeys.has(item.providerKey)) {
    throw new Error(`${label} provider must match at least one citation`);
  }

  for (const providerKey of item.confirmedProviderKeys) {
    if (!knownProviderKeys.has(providerKey)) {
      throw new Error(
        `${label} confirmed provider must exist in selected evidence`,
      );
    }
  }
};

const assertPreviewMedia = (
  previewMedia: ReaderSummaryItem["previewMedia"],
  label: string,
): void => {
  if (previewMedia === undefined) {
    return;
  }
  if (
    !["image", "video"].includes(previewMedia.kind) ||
    previewMedia.url.trim().length === 0
  ) {
    throw new Error(`${label} preview media must include kind and URL`);
  }
  if (
    previewMedia.sourceUrl !== undefined &&
    previewMedia.sourceUrl.trim().length === 0
  ) {
    throw new Error(`${label} preview media source URL must be non-empty`);
  }
  if (
    previewMedia.altText !== undefined &&
    previewMedia.altText.trim().length === 0
  ) {
    throw new Error(`${label} preview media alt text must be non-empty`);
  }
};

const assertCitationIds = (
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
  label: string,
): void => {
  for (const citationId of citationIds) {
    if (!knownCitationIds.has(citationId)) {
      throw new Error(`${label} cites evidence outside citation map`);
    }
  }
};

const providerKeysFromCitations = (
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  knownCitationIds: ReadonlySet<string>,
): ReadonlySet<string> => {
  const providerKeys = new Set<string>();

  for (const citationId of knownCitationIds) {
    const providerKey = citationById.get(citationId)?.providerKey;
    if (providerKey !== undefined) {
      providerKeys.add(providerKey);
    }
  }

  return providerKeys;
};
