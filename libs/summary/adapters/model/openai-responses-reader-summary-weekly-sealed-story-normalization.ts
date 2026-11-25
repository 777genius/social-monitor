import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  sealedCompactStoryKeys,
  sealedCompactStoryKeysWithHeadline,
} from "./openai-responses-reader-summary-weekly-sealed-shape-keys";
import { hasExactKeys } from "./openai-responses-reader-summary-weekly-shape-validation";
import { normalizeExpandedLegacyStoryStatus } from "./openai-responses-reader-summary-weekly-legacy-compatibility";
import { exactLegacyCitationRange } from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";
import { exactLegacyClaimType } from "./openai-responses-reader-summary-weekly-legacy-claim-policy";

/**
 * A sealed-compact story is admitted independently of root/section decoding.
 * Only the already-admitted section headline may supply its public headline;
 * a model-supplied story headline is never trusted for that field.
 */
export const normalizeSealedCompactWeeklyStory = (
  input: ReaderSummaryWeeklyModelInput,
  rawStory: unknown,
  sections: readonly { readonly storyId: unknown; readonly heading: unknown }[],
  index: number,
) => {
    const story = hasExactKeys(rawStory, sealedCompactStoryKeys)
      ? rawStory
      : hasExactKeys(rawStory, sealedCompactStoryKeysWithHeadline)
        ? rawStory
        : undefined;
    if (story === undefined) {
      throw new Error(
        `Sealed compact weekly story ${index + 1} must contain exactly the supported fields`,
      );
    }
    const citationIds = exactLegacyCitationRange(
      input,
      story,
      `sealed compact weekly story ${index + 1}`,
    );
    exactLegacyClaimType(
      story.claimType,
      `sealed compact weekly story ${index + 1}`,
    );
    const heading = sections.find(
      (section) => section.storyId === story.storyId,
    )?.heading;
    if (typeof heading !== "string") {
      throw new Error(
        `Sealed compact weekly story ${index + 1} lacks a matching section headline`,
      );
    }
    return {
      storyId: story.storyId,
      headline: heading,
      summary: story.synthesis,
      status: normalizeExpandedLegacyStoryStatus(story.status),
      observedFrom: story.observedFrom,
      observedThrough: story.observedThrough,
      citationIds,
    };
};
