import type {
  ReaderSummaryCoveragePlanItem,
  ReaderSummaryNarrativeSection,
} from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
} from "../../ports";

type DraftTopStory = ProviderReaderSummaryAttempt["draft"]["topStories"][number];

/** The lead projection owns copy and identity, not citation allocation. */
export const buildDeterministicReaderLeadSection = (params: Readonly<{
  input: Pick<ReaderSummaryModelInput, "coveragePlan">;
  executiveSummary: string;
  lead: ReaderSummaryCoveragePlanItem;
  leadStory: DraftTopStory | undefined;
  leadCitationIds: readonly string[];
}>): ReaderSummaryNarrativeSection => {
  const { lead, leadStory, leadCitationIds } = params;
  const leadSection: ReaderSummaryNarrativeSection = {
    id: "narrative-deterministic-lead",
    kind: "lead",
    title:
      params.input.coveragePlan.mode === "daily_synthesis"
        ? "Daily synthesis"
        : (leadStory?.title ?? "Main signal"),
    text: params.executiveSummary,
    citationIds: leadCitationIds,
    ...(params.input.coveragePlan.mode === "daily_synthesis"
      ? {}
      : { storyClusterId: lead.clusterId }),
  };
  return leadSection;
};
