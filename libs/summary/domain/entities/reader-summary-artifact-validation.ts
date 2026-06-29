import { assertReaderSummaryScope } from "../value-objects/reader-summary-scope";
import { assertReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type {
  ReaderSummaryArtifactProps,
  ReaderSummaryContent,
  ReaderSummaryItem,
} from "./reader-summary-artifact";
import type { ReaderSummaryCitation } from "./citation";
import {
  assertUniqueReaderSummaryContentItems,
  assertUniqueReaderSummarySourceMixProviders,
} from "./reader-summary-content-identity";
import { assertReaderSummaryContentShape } from "./reader-summary-content-shape";

export const assertReaderSummaryArtifactValid = (
  props: ReaderSummaryArtifactProps,
): void => {
  if (props.schemaVersion !== "reader_summary.artifact.v1") {
    throw new Error("Unsupported reader summary schema version");
  }

  if (props.readerSummaryId.trim().length === 0) {
    throw new Error("Reader summary id must be non-empty");
  }

  assertReaderSummaryScope(props.scope);
  assertReaderSummaryPeriod(props.period);

  if (
    (props.userId ?? "").trim().length === 0 &&
    props.subscriptionId !== undefined
  ) {
    throw new Error("Subscription-scoped reader summary must include user id");
  }

  if (
    props.sourceWindow.endedAt.getTime() <=
    props.sourceWindow.startedAt.getTime()
  ) {
    throw new Error("Reader summary source window end must be after start");
  }

  if (
    props.sourceWindow.startedAt.getTime() < props.period.startedAt.getTime() ||
    props.sourceWindow.endedAt.getTime() > props.period.endedAt.getTime()
  ) {
    throw new Error("Reader summary source window must stay inside period");
  }

  if (
    props.sourceWindow.storyClusterIds.length !== props.storyClusters.length
  ) {
    throw new Error(
      "Reader summary source window must reference every story cluster",
    );
  }

  const clusterIds = new Set(props.storyClusters.map((cluster) => cluster.id));
  const citationById = assertCitations(props.citationMap);
  const citationIds = new Set(citationById.keys());

  for (const cluster of props.storyClusters) {
    if (
      cluster.id.trim().length === 0 ||
      cluster.representativeFeedItemId.trim().length === 0
    ) {
      throw new Error("Reader summary story cluster ids must be non-empty");
    }

    if (cluster.interestIds.length === 0 || cluster.providerKeys.length === 0) {
      throw new Error(
        "Reader summary story clusters must include interest and provider coverage",
      );
    }
  }

  for (const story of props.topStories) {
    assertClusterReference(
      story.storyClusterId,
      clusterIds,
      "Reader summary top story",
    );
    assertCitedSection(
      story.title,
      story.summary,
      story.citationIds,
      citationIds,
      "Reader summary top story",
    );
  }

  for (const highlight of props.interestHighlights) {
    if (highlight.interestId.trim().length === 0) {
      throw new Error(
        "Reader summary interest highlight interest id must be non-empty",
      );
    }
    assertCitedSection(
      highlight.title,
      highlight.summary,
      highlight.citationIds,
      citationIds,
      "Reader summary interest highlight",
    );
  }

  for (const signal of props.repeatedSignals) {
    assertClusterReference(
      signal.storyClusterId,
      clusterIds,
      "Reader summary repeated signal",
    );
    assertCitedSection(
      signal.title,
      signal.title,
      signal.citationIds,
      citationIds,
      "Reader summary repeated signal",
    );
    if (signal.interestIds.length < 2) {
      throw new Error(
        "Reader summary repeated signal must cover at least two interests",
      );
    }
  }

  for (const risk of props.risksAndUnknowns) {
    for (const citationId of risk.citationIds ?? []) {
      if (!citationIds.has(citationId)) {
        throw new Error(
          "Reader summary risk cites evidence outside citation map",
        );
      }
    }
  }

  if (props.content !== undefined) {
    assertReaderSummaryContent(
      props.content,
      citationIds,
      citationById,
      providerKeysFromStoryClusters(props.storyClusters),
    );
  }

  for (const contextArtifact of props.contextArtifacts) {
    if (
      contextArtifact.artifactId.trim().length === 0 ||
      contextArtifact.summaryText.trim().length === 0
    ) {
      throw new Error(
        "Reader summary context artifact must include id and summary text",
      );
    }
    assertReaderSummaryScope(contextArtifact.scope);
    assertReaderSummaryPeriod(contextArtifact.period);
  }

  if (
    props.topStories.length === 0 &&
    !props.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "No-signal reader summary must include no_signal quality flag",
    );
  }

  if (
    props.qualityFlags.includes("no_signal") &&
    (props.noSignalReason ?? "").trim().length === 0
  ) {
    throw new Error("No-signal reader summary must include a reason");
  }

  if (
    props.usage.inputTokens < 0 ||
    props.usage.outputTokens < 0 ||
    props.usage.estimatedCostUsd < 0
  ) {
    throw new Error("Reader summary usage values must be non-negative");
  }

  if (props.confidence.score < 0 || props.confidence.score > 1) {
    throw new Error("Reader summary confidence score must be between 0 and 1");
  }

  if (
    props.confidence.level === "none" &&
    !props.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "No-confidence reader summary must include no_signal quality flag",
    );
  }

  if (props.confidence.rationale.trim().length === 0) {
    throw new Error("Reader summary confidence rationale must be non-empty");
  }
};

const assertReaderSummaryContent = (
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

const assertCitations = (
  citations: readonly ReaderSummaryCitation[],
): Map<string, ReaderSummaryCitation> => {
  const citationsById = new Map<string, ReaderSummaryCitation>();

  for (const citation of citations) {
    if (citation.citationId.trim().length === 0) {
      throw new Error("Reader summary citation id must be non-empty");
    }

    if (citation.feedItemId.trim().length === 0) {
      throw new Error("Reader summary citation feed item id must be non-empty");
    }

    if (citation.sourceItemId.trim().length === 0) {
      throw new Error(
        "Reader summary citation source item id must be non-empty",
      );
    }

    if (citation.providerKey.trim().length === 0) {
      throw new Error("Reader summary citation provider key must be non-empty");
    }

    if (citationsById.has(citation.citationId)) {
      throw new Error("Reader summary citation ids must be unique");
    }

    citationsById.set(citation.citationId, citation);
  }

  return citationsById;
};

const providerKeysFromStoryClusters = (
  storyClusters: readonly { readonly providerKeys: readonly string[] }[],
): ReadonlySet<string> =>
  new Set(storyClusters.flatMap((cluster) => cluster.providerKeys));

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

const assertCitedSection = (
  title: string,
  summary: string,
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
  label: string,
): void => {
  if (
    title.trim().length === 0 ||
    summary.trim().length === 0 ||
    citationIds.length === 0
  ) {
    throw new Error(`${label} must include title, summary and citations`);
  }

  for (const citationId of citationIds) {
    if (!knownCitationIds.has(citationId)) {
      throw new Error(`${label} cites evidence outside citation map`);
    }
  }
};

const assertClusterReference = (
  storyClusterId: string,
  knownClusterIds: ReadonlySet<string>,
  label: string,
): void => {
  if (!knownClusterIds.has(storyClusterId)) {
    throw new Error(`${label} references unknown story cluster`);
  }
};
