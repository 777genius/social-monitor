import type { ReaderPostPromotionAttestationV3 } from "../../libs/summary/domain";

export type V3ArtifactPayload = Record<string, unknown> & {
  citationMap: Array<Record<string, string>>;
  promotionAttestations?: ReaderPostPromotionAttestationV3[];
  content?: { newsWithoutRatingPosts?: Array<Record<string, unknown>> };
};
export type V3FixturePayload = Record<string, unknown> & {
  tenantId: string;
  workspaceId: string;
  interestId: string;
  readerSummaryArtifactId: string;
  requestedAt: string;
  periodStartedAt: string;
  periodEndedAt: string;
  periodTimezone: string;
  periodKey: string;
  modelVersion: string;
  report: Record<string, unknown> & {
    promptVersion: string;
    artifactPayload: V3ArtifactPayload;
  };
  exactProof: Record<string, unknown>;
};
