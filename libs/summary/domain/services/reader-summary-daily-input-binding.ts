import type { ReaderSummaryArtifactProps } from "../entities/reader-summary-artifact";
import { readReaderSummaryDailyGenerationInput, type ReaderSummaryDailyGenerationInput } from "../value-objects/reader-summary-daily-generation-input";
import type { StoryCluster } from "../value-objects/summary-evidence-item";
import { assertReaderSummaryDailyEditorialArticle } from "./reader-summary-daily-editorial-plan";
import { readerPromotionProviderIsPost } from "../policies/reader-promotion-source-registry";

/** Separate narrative authority; artifact.storyClusters remains the sealed board. */
export const dailyGenerationNarrativeClusters = (proof: ReaderSummaryDailyGenerationInput): readonly StoryCluster[] =>
  proof.selected.map(entry => ({ id: entry.storyId, storyKey: entry.storyId,
    representativeFeedItemId: entry.feedItemId, duplicateFeedItemIds: [],
    interestIds: [entry.interestId], providerKeys: [entry.providerKey], score: 1,
    observedAtRange: { startedAt: new Date(entry.observedAt), endedAt: new Date(entry.observedAt) }, whyImportant: [] }));

export const assertDailyGenerationArtifactBinding = (props: ReaderSummaryArtifactProps): void => {
  if (props.dailyGenerationInput === undefined) return;
  const proof = readReaderSummaryDailyGenerationInput(props.dailyGenerationInput);
  if (proof === undefined || props.period.cadence !== "daily" || proof.periodKey !== props.period.periodKey ||
      proof.cutoffAt !== props.sourceWindow.exactIngestionCutoff || proof.selected.length === 0 || proof.sent === undefined || props.content === undefined ||
      proof.selected.some(entry => !readerPromotionProviderIsPost(entry.providerKey) ||
        !props.sourceWindow.selectedFeedItemIds.includes(entry.feedItemId) ||
        !props.citationMap.some(citation => citation.feedItemId === entry.feedItemId &&
          citation.sourceItemId === entry.sourceItemId && citation.providerKey === entry.providerKey))) {
    throw new Error("Daily generation input artifact binding is invalid");
  }
  const byCitation = new Map(props.citationMap.map(citation => [citation.citationId, citation]));
  const byFeed = new Map(proof.selected.map(entry => [entry.feedItemId, entry]));
  const providerCounts = new Map<string, number>();
  for (const entry of proof.selected) providerCounts.set(entry.providerKey, (providerCounts.get(entry.providerKey) ?? 0) + 1);
  if (props.content.sourceMix.length !== providerCounts.size || props.content.sourceMix.some(source =>
    source.itemCount !== providerCounts.get(source.providerKey))) throw new Error("Daily source mix differs from actual model input");
  if (props.dailyEditorialProof !== undefined) {
    assertReaderSummaryDailyEditorialArticle({
      proof: props.dailyEditorialProof, input: proof,
      stories: props.topStories, sections: props.content.narrativeSections ?? [],
      citations: props.citationMap,
    });
    for (const section of props.content.narrativeSections ?? []) {
      if (section.id === "github-trending" && (
        section.kind !== "watch" || section.citationIds.some(id =>
          byCitation.get(id)?.providerKey !== "github-trending-page")
      )) throw new Error("Daily GitHub appendix citation binding is invalid");
    }
    return;
  }
  const check = (ids: readonly string[], storyId?: string): void => {
    if (ids.length === 0 || ids.some(id => {
      const citation = byCitation.get(id), entry = citation === undefined ? undefined : byFeed.get(citation.feedItemId);
      return entry === undefined || storyId !== undefined && entry.storyId !== storyId;
    })) throw new Error("Daily narrative cites evidence outside actual model input");
  };
  for (const story of props.topStories) check(story.citationIds, story.storyClusterId);
  for (const section of props.content?.narrativeSections ?? []) {
    const githubAppendix = section.id === "github-trending" && section.kind === "watch" &&
      section.citationIds.every(id => byCitation.get(id)?.providerKey === "github-trending-page");
    if (!githubAppendix) check(section.citationIds, section.storyClusterId);
  }
};
