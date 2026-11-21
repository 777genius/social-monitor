import { projectLegacyWeeklyDocument } from "./openai-responses-reader-summary-weekly-document-projection";
import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { sealedCompactOutputKeys } from "./openai-responses-reader-summary-weekly-sealed-shape-keys";
import { normalizeSealedCompactWeeklyStory } from "./openai-responses-reader-summary-weekly-sealed-story-normalization";
import { exactLegacyCitationRange } from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";

import { normalizeExpandedWeeklySection } from "./openai-responses-reader-summary-weekly-section-normalization";

// Sealed compact owns story-to-section headline reconciliation.
const normalizeSealedCompactWeeklyModelOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: Record<(typeof sealedCompactOutputKeys)[number], unknown>,
): unknown => {
  if (!Array.isArray(value.stories) || !Array.isArray(value.sections)) {
    throw new Error("Sealed compact weekly stories and sections must be arrays");
  }
  const rootCitationIds = exactLegacyCitationRange(
    input,
    value,
    "sealed compact weekly output",
  );
  const sections = value.sections.map((rawSection, index) =>
    normalizeExpandedWeeklySection(
      input, rawSection, value.stories, `Sealed compact weekly section ${index + 1}`,
    ),
  );
  const stories = value.stories.map((rawStory, index) => {
    return normalizeSealedCompactWeeklyStory(input, rawStory, sections, index);
  });
  return projectLegacyWeeklyDocument(value, rootCitationIds, stories, sections);
};

export { normalizeSealedCompactWeeklyModelOutput };
