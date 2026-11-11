import type { ReaderSummaryModelInput } from "../../ports";

export const readerSummaryCoverageInstructions = (
  coveragePlan: ReaderSummaryModelInput["coveragePlan"] | undefined,
): readonly string[] =>
  coveragePlan?.lead === undefined
    ? [
        "coveragePlan.lead is null because no evidence passed the editorial lead gate. Return an honest no-signal response: topStories and narrativeSections must be empty, set noSignalReason, and do not promote a watch-only or down-ranked item into the headline.",
      ]
    : coveragePlan.mode === "daily_synthesis"
      ? [
          "coveragePlan.mode is daily_synthesis. Write a thematic daily digest, not an article about one source item. The headline and opening sentence must synthesize the shared reader-relevant situation across coveragePlan.lead and at least one coveragePlan.secondary cluster.",
          "The first narrativeSections item must be kind lead, set storyClusterId to null, and cite 2-3 planned citations including at least one citation from coveragePlan.lead and at least one from coveragePlan.secondary. Do not start the headline with a provider name or copy any single source title.",
          "Follow the synthesis lead with exactly one secondary_signal for every coveragePlan.secondary entry. Each secondary_signal must copy its exact storyClusterId and cite only that cluster's citationIds. Keep these sections concrete and avoid repeating the synthesis wording.",
          "A daily_synthesis headline may name the common product or workflow pressure supported across the planned clusters, but must not merge unrelated facts into one event or claim that all sources discuss the same story.",
        ]
      : [
          "The first narrativeSections item must be kind lead and cite one or more citationIds from coveragePlan.lead. Follow it with optional main_signal and why_it_matters sections and one secondary_signal for every entry in coveragePlan.secondary. An optional watch may cite only self-contained evidence that is high-engagement, eligible first-party, or independently supported across providers; never promote a truncated low-engagement fragment. Never fill a missing section with generic prose.",
          ...(coveragePlan.lead.providerKeys.length <= 1
            ? [
                "coveragePlan.lead has one provider group. Frame the headline and opening sentence explicitly as that provider's discussion, report or first-party announcement. Do not generalize it into what developers, users or the industry are doing.",
              ]
            : []),
          "For secondary_signal, copy the exact storyClusterId from coveragePlan and cite only citationIds listed for that planned cluster.",
          "Keep the lead focused on coveragePlan.lead. Other signals today must remain concise and must not displace the lead.",
        ];

