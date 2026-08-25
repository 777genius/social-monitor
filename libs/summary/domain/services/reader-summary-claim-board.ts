import type { ReaderSummaryCitation } from "../entities/citation";
import type {
  ReaderSummaryClaim,
  ReaderSummaryClaimRisk,
} from "../entities/reader-summary-claim";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";
import type {
  ReaderSummaryRisk,
  TopRead,
  TopReadConfidence,
} from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { compactUnique, nonEmpty } from "../value-objects/summary-text";

export type ReaderSummaryClaimBoardInput = {
  readonly topReads: readonly TopRead[];
  readonly narrativeSections?: readonly ReaderSummaryNarrativeSection[];
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

  const narrativeClaims = (input.narrativeSections ?? [])
    .slice(0, maxClaimBoardItems)
    .map((section) =>
      claimFromNarrativeSection(
        section,
        input.topReads,
        input.risksAndUnknowns,
        citationById,
        evidenceByFeedItemId,
      ),
    )
    .filter((claim): claim is ReaderSummaryClaim => claim !== undefined);
  if (narrativeClaims.length > 0) {
    return narrativeClaims;
  }

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

const claimFromNarrativeSection = (
  section: ReaderSummaryNarrativeSection,
  topReads: readonly TopRead[],
  risksAndUnknowns: readonly ReaderSummaryRisk[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): ReaderSummaryClaim | undefined => {
  const citationIds = compactUnique(section.citationIds).filter((citationId) =>
    citationById.has(citationId),
  );
  const supportingReads = topReads.filter((read) =>
    overlaps(read.citationIds, citationIds),
  );
  const evidence = claimEvidence({
    citationIds,
    fallbackTitle: section.title,
    citationById,
    evidenceByFeedItemId,
  });
  if (section.text.trim().length === 0 || evidence.length === 0) {
    return undefined;
  }
  const confidence = conservativeConfidence(supportingReads, evidence.length);
  const providerKeys = compactUnique(evidence.map((item) => item.providerKey));

  return {
    id: section.id,
    claim: section.text,
    evidence,
    confidence,
    risks: claimRisks(
      {
        citationIds,
        confirmedProviderCount: providerKeys.length,
        confidence,
      },
      risksAndUnknowns,
      evidence.length,
    ).slice(0, maxClaimRisks),
    citationIds,
  };
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
  const evidence = claimEvidence({
    citationIds,
    fallbackTitle: read.title,
    fallbackCanonicalUrl: read.canonicalUrl,
    citationById,
    evidenceByFeedItemId,
  });

  if (read.title.trim().length === 0 || evidence.length === 0) {
    return undefined;
  }

  return {
    claim: read.title,
    evidence,
    confidence: read.confidence,
    risks: claimRisks(
      {
        citationIds,
        confirmedProviderCount: read.confirmedProviderKeys.length,
        confidence: read.confidence,
      },
      risksAndUnknowns,
      evidence.length,
    ).slice(0, maxClaimRisks),
    citationIds,
  };
};

const claimEvidence = (params: {
  readonly citationIds: readonly string[];
  readonly fallbackTitle: string;
  readonly fallbackCanonicalUrl?: string;
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>;
}) =>
  params.citationIds
    .map((citationId) => {
      const citation = params.citationById.get(citationId);
      if (citation === undefined) {
        return undefined;
      }
      const evidence = params.evidenceByFeedItemId.get(citation.feedItemId);

      return {
        title: nonEmpty(evidence?.title ?? "", params.fallbackTitle),
        providerKey: citation.providerKey,
        citationId,
        canonicalUrl: citation.canonicalUrl ?? params.fallbackCanonicalUrl,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .slice(0, maxClaimEvidenceItems);

const claimRisks = (
  claim: {
    readonly citationIds: readonly string[];
    readonly confirmedProviderCount: number;
    readonly confidence: TopReadConfidence;
  },
  risksAndUnknowns: readonly ReaderSummaryRisk[],
  evidenceCount: number,
): readonly ReaderSummaryClaimRisk[] => {
  const matchedRisks = risksAndUnknowns
    .filter((risk) => overlaps(claim.citationIds, risk.citationIds ?? []))
    .map((risk): ReaderSummaryClaimRisk => ({
      kind: "unresolved",
      description: risk.description,
    }));
  const inferredRisks: ReaderSummaryClaimRisk[] = [];

  if (claim.confirmedProviderCount <= 1) {
    inferredRisks.push({
      kind: "single_source",
      description:
        "Needs independent confirmation before treating it as verified.",
    });
  }
  if (claim.confidence.level === "low" || claim.confidence.score < 0.5) {
    inferredRisks.push({
      kind: "low_confidence",
      description: claim.confidence.rationale,
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

const conservativeConfidence = (
  reads: readonly TopRead[],
  evidenceCount: number,
): TopReadConfidence => {
  if (reads.length === 0) {
    return {
      level: "low",
      score: evidenceCount > 1 ? 0.42 : 0.32,
      rationale:
        "Confidence is limited because this narrative claim is not represented by a ranked top read.",
    };
  }

  return [...reads].sort(
    (left, right) => left.confidence.score - right.confidence.score,
  )[0]!.confidence;
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
