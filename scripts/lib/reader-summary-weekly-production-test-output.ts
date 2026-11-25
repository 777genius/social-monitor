import { buildModelInputFromDbState } from "./reader-summary-weekly-production-input";
import { completeDbState, reviewManifestFor } from "./reader-summary-weekly-production-test-fixture";
import { readerSummaryWeeklyModelOutputSchemaVersion, type ReaderSummaryWeeklyModelInput, type ReaderSummaryWeeklyModelOutput } from "../../libs/summary/ports/reader-summary-weekly-model.port";

export function completeModelInput(): ReaderSummaryWeeklyModelInput {
  const dbState = completeDbState();
  const built = buildModelInputFromDbState(dbState, reviewManifestFor(dbState));
  if (built.status !== "complete") {
    throw new Error(built.reasons.join("; "));
  }
  return built.input;
}

export function outputFor(
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput {
  const citations = input.citations.map((citation) => citation.citationId);
  const stories = input.stories.map((story) => {
    const storyCitations = input.citations
      .filter((citation) => citation.storyId === story.storyId)
      .map((citation) => citation.citationId);
    const dates = storyCitations
      .map((citationId) => input.citations.find((item) => item.citationId === citationId)!)
      .map((citation) => citation.observedOn)
      .sort();
    return {
      storyId: story.storyId,
      headline: `Evidence theme ${story.storyId.slice(-8)} holds steady across the week`,
      summary:
        "The cited item captures one stable snapshot in the certified week, keeping the reader account grounded in observed facts without adding unsupported movement.",
      status: "watch" as const,
      observedFrom: dates[0]!,
      observedThrough: dates[dates.length - 1]!,
      citationIds: [...storyCitations],
    };
  });
  const leadCitationIds = citations.slice(0, 12).sort();
  const leadStory = stories.find((story) => story.citationIds.length >= 2);
  if (leadStory === undefined) {
    throw new Error("Positive weekly fixture requires one cross-day story");
  }
  return {
    schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
    sealId: input.sealId,
    sealSha: input.sealSha,
    weekStartedOn: input.weekStartedOn,
    weekEndedOn: input.weekEndedOn,
    headline: "Certified reader evidence points to steady developer attention",
    headlineCitationIds: [...leadCitationIds],
    takeaway:
      "The certified week shows durable attention across developer records and feed records, with each cited signal staying tied to observed facts from the reviewed window.",
    takeawayCitationIds: [...leadCitationIds],
    synthesis:
      "Across the certified week, cited developer records and feed records show a steady reader-relevant picture. The facts give enough breadth to explain why the account matters to readers while staying tied to observed items. The text treats the week as one editorial unit and keeps every statement within the cited facts.",
    synthesisCitationIds: [...leadCitationIds],
    stories,
    sections: [
      {
        sectionId: "section:lead",
        storyId: leadStory.storyId,
        kind: "lead" as const,
        claimType: "snapshot" as const,
        heading: "Steady certified reader signal",
        text:
          "The lead item gives readers a grounded snapshot of the certified week, connecting developer and feed context without adding claims beyond the cited records.",
        observedFrom: leadStory.observedFrom,
        observedThrough: leadStory.observedThrough,
        citationIds: [...leadStory.citationIds],
      },
    ],
  };
}
