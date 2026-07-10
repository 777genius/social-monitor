import type { ReaderSummaryClaim } from "./reader-summary-claim";
import { assertReaderSummaryClaimIdentity } from "./reader-summary-narrative-validation";

export const assertReaderSummaryClaim = (
  claim: ReaderSummaryClaim,
  knownCitationIds: ReadonlySet<string>,
  knownProviderKeys: ReadonlySet<string>,
): void => {
  assertReaderSummaryClaimIdentity(claim);
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

  assertClaimCitationIds(claim.citationIds, knownCitationIds);
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
    assertClaimCitationIds([evidence.citationId], knownCitationIds);
  }

  for (const risk of claim.risks) {
    if (risk.description.trim().length === 0) {
      throw new Error("Reader summary claim risks must be non-empty");
    }
    if (
      ![
        "single_source",
        "low_confidence",
        "low_evidence",
        "unresolved",
      ].includes(risk.kind)
    ) {
      throw new Error("Reader summary claim risk kind is unsupported");
    }
  }
};

const assertClaimCitationIds = (
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
): void => {
  if (citationIds.some((citationId) => !knownCitationIds.has(citationId))) {
    throw new Error("Reader summary claim cites evidence outside citation map");
  }
};
