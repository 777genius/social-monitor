import { SourceContentQualityPolicy } from "@social-monitor/relevance/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";
import { isFirstPartyOfficialQuality } from "@social-monitor/summary/domain";

export type ReaderSummaryClaimQualityReport = {
  readonly claimCount: number;
  readonly claimsWithTwoEvidenceOrRisk: number;
  readonly missingStructuredClaimBoard: boolean;
  readonly singleSourceConfidentClaimCount: number;
  readonly socialOnlyConfidentClaimCount: number;
  readonly highConfidenceWithoutCrossSourceEvidence: boolean;
  readonly gates: Record<string, boolean>;
};

type ClaimQualityView = {
  readonly content: {
    readonly claimBoard: readonly ClaimInput[];
    readonly topReads: readonly unknown[];
  };
  readonly citations: readonly CitationInput[];
  readonly confidence: {
    readonly level: "none" | "low" | "medium" | "high";
  };
  readonly coverage: { readonly crossSourceClusterCount: number };
};

type ClaimInput = {
  readonly confidence: { readonly level: "low" | "medium" | "high" };
  readonly risks: readonly unknown[];
  readonly evidence: readonly { readonly providerKey: string }[];
  readonly citationIds: readonly string[];
};

type CitationInput = {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly providerKey: string;
};

type FeedItemInput = {
  readonly id: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly authorHandle: string | null;
  readonly title: string;
  readonly providerMetadata: unknown;
};

const communityProviderKeys = new Set(["reddit", "x-twitter"]);

export const buildReaderSummaryClaimQuality = (params: {
  readonly view: ClaimQualityView | undefined;
  readonly feedItems: readonly FeedItemInput[];
}): ReaderSummaryClaimQualityReport => {
  const claims = params.view?.content.claimBoard ?? [];
  const citationById = new Map(
    (params.view?.citations ?? []).map((citation) => [
      citation.citationId,
      citation,
    ]),
  );
  const feedItemById = new Map(
    params.feedItems.map((item) => [item.id, item] as const),
  );
  const qualityPolicy = new SourceContentQualityPolicy();
  let claimsWithTwoEvidenceOrRisk = 0;
  let singleSourceConfidentClaimCount = 0;
  let socialOnlyConfidentClaimCount = 0;

  for (const claim of claims) {
    const citationRows = claim.citationIds
      .map((citationId) => citationById.get(citationId))
      .filter((citation): citation is CitationInput => citation !== undefined);
    const evidenceProviderKeys = new Set(
      [
        ...claim.evidence.map((item) => item.providerKey),
        ...citationRows.map((citation) => citation.providerKey),
      ].map((providerKey) => providerKey.trim().toLowerCase()),
    );
    const hasExplicitRisk = claim.risks.length > 0;
    const hasFirstPartyOfficialSource = citationRows.some((citation) => {
      const item = feedItemById.get(citation.feedItemId);
      if (item === undefined) {
        return false;
      }

      return isFirstPartyOfficialQuality(
        qualityPolicy.evaluate({
          providerKey: item.providerKey,
          title: item.title,
          canonicalUrl: item.canonicalUrl,
          authorHandle: item.authorHandle ?? undefined,
          providerMetadata: asJsonObject(item.providerMetadata),
        }),
      );
    });

    if (claim.evidence.length >= 2 || hasExplicitRisk) {
      claimsWithTwoEvidenceOrRisk += 1;
    }
    if (
      evidenceProviderKeys.size <= 1 &&
      claim.confidence.level === "high" &&
      !hasExplicitRisk
    ) {
      singleSourceConfidentClaimCount += 1;
    }
    if (
      evidenceProviderKeys.size > 0 &&
      [...evidenceProviderKeys].every((providerKey) =>
        communityProviderKeys.has(providerKey),
      ) &&
      claim.confidence.level === "high" &&
      !hasExplicitRisk &&
      !hasFirstPartyOfficialSource
    ) {
      socialOnlyConfidentClaimCount += 1;
    }
  }

  const highConfidenceWithoutCrossSourceEvidence =
    params.view !== undefined &&
    params.view.coverage.crossSourceClusterCount === 0 &&
    params.view.confidence.level === "high";
  const missingStructuredClaimBoard =
    params.view !== undefined &&
    params.view.content.topReads.length > 0 &&
    claims.length === 0;
  const gates = {
    structuredClaimBoardPresent: !missingStructuredClaimBoard,
    everyClaimHasTwoEvidenceOrExplicitRisk:
      claims.length > 0 && claimsWithTwoEvidenceOrRisk === claims.length,
    noSingleSourceConfidentClaims: singleSourceConfidentClaimCount === 0,
    noSocialOnlyConfidentClaims: socialOnlyConfidentClaimCount === 0,
    confidenceDropsWithoutCrossSourceEvidence:
      !highConfidenceWithoutCrossSourceEvidence,
  };

  return {
    claimCount: claims.length,
    claimsWithTwoEvidenceOrRisk,
    missingStructuredClaimBoard,
    singleSourceConfidentClaimCount,
    socialOnlyConfidentClaimCount,
    highConfidenceWithoutCrossSourceEvidence,
    gates,
  };
};

const asJsonObject = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
