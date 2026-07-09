import type { ReaderSummaryCitation } from "../entities/citation";
import type {
  ReaderSummaryClaim,
  ReaderSummaryClaimRisk,
} from "../entities/reader-summary-claim";
import type { ReaderSummaryRisk, TopRead } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { compactUnique, nonEmpty } from "../value-objects/summary-text";

export type ReaderSummaryClaimBoardInput = {
  readonly topReads: readonly TopRead[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
};

const maxClaimBoardItems = 7;
const maxClaimEvidenceItems = 3;
const maxClaimRisks = 2;

export const buildReaderSummaryClaimBoard = (
  input: ReaderSummaryClaimBoardInput,
): readonly ReaderSummaryClaim[] => {
  const citationById = new Map(
    input.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  const evidenceByFeedItemId = new Map(
    (input.selectedEvidence ?? []).map(
      (evidence) => [evidence.feedItemId, evidence] as const,
    ),
  );

  return input.topReads
    .slice(0, maxClaimBoardItems)
    .map((read) =>
      claimFromTopRead(
        read,
        input.risksAndUnknowns,
        citationById,
        evidenceByFeedItemId,
      ),
    )
    .filter((claim): claim is ReaderSummaryClaim => claim !== undefined);
};

const claimFromTopRead = (
  read: TopRead,
  risksAndUnknowns: readonly ReaderSummaryRisk[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): ReaderSummaryClaim | undefined => {
  const citationIds = compactUnique(read.citationIds).filter((citationId) =>
    citationById.has(citationId),
  );
  const evidence = citationIds
    .map((citationId) => {
      const citation = citationById.get(citationId);

      return citation === undefined
        ? undefined
        : {
            title: evidenceTitle(read, citation, evidenceByFeedItemId),
            providerKey: citation.providerKey,
            citationId,
            canonicalUrl: citation.canonicalUrl ?? read.canonicalUrl,
          };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .slice(0, maxClaimEvidenceItems);

  if (read.title.trim().length === 0 || evidence.length === 0) {
    return undefined;
  }

  return {
    claim: read.title,
    evidence,
    confidence: read.confidence,
    risks: claimRisks(read, risksAndUnknowns, evidence.length).slice(
      0,
      maxClaimRisks,
    ),
    citationIds,
  };
};

const evidenceTitle = (
  read: TopRead,
  citation: ReaderSummaryCitation,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): string => {
  const evidence = evidenceByFeedItemId.get(citation.feedItemId);

  return nonEmpty(evidence?.title ?? "", read.title);
};

const claimRisks = (
  read: TopRead,
  risksAndUnknowns: readonly ReaderSummaryRisk[],
  evidenceCount: number,
): readonly ReaderSummaryClaimRisk[] => {
  const matchedRisks = risksAndUnknowns
    .filter((risk) => overlaps(read.citationIds, risk.citationIds ?? []))
    .map((risk): ReaderSummaryClaimRisk => ({
      kind: "unresolved",
      description: risk.description,
    }));
  const inferredRisks: ReaderSummaryClaimRisk[] = [];

  if (read.confirmedProviderKeys.length <= 1) {
    inferredRisks.push({
      kind: "single_source",
      description:
        "Needs independent confirmation before treating it as verified.",
    });
  }
  if (read.confidence.level === "low" || read.confidence.score < 0.5) {
    inferredRisks.push({
      kind: "low_confidence",
      description: read.confidence.rationale,
    });
  }
  if (evidenceCount < 2) {
    inferredRisks.push({
      kind: "low_evidence",
      description:
        "Only one cited evidence line is available in the claim board.",
    });
  }

  return uniqueRisks([...matchedRisks, ...inferredRisks]);
};

const overlaps = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const rightSet = new Set(right);

  return left.some((value) => rightSet.has(value));
};

const uniqueRisks = (
  risks: readonly ReaderSummaryClaimRisk[],
): readonly ReaderSummaryClaimRisk[] => {
  const seen = new Set<string>();
  const result: ReaderSummaryClaimRisk[] = [];

  for (const risk of risks) {
    const key = `${risk.kind}:${risk.description.trim().toLowerCase()}`;
    if (risk.description.trim().length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(risk);
  }

  return result;
};
