import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
} from "../../domain";

export type ReaderSummaryQualityRejectionTopRead = {
  readonly title: string;
  readonly providerKey?: string;
  readonly canonicalUrl?: string;
  readonly citationIds: readonly string[];
};

export type ReaderSummaryQualityRejectionCitation = {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly canonicalUrl?: string;
};

export type ReaderSummaryQualityRejectionViolation = {
  readonly code: string;
  readonly reason: string;
  readonly topReadTitle?: string;
  readonly citationId?: string;
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
  readonly providerKey?: string;
  readonly canonicalUrl?: string;
};

export type GetReaderSummaryQualityRejectionResult = {
  readonly readerSummaryJobId: string;
  readonly readerSummaryId: string;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly headline: string;
  readonly failureClass: "quality_rejected";
  readonly canonicalScore: number;
  readonly shadow: {
    readonly mode: "shadow";
    readonly riskScore: number;
    readonly signals: readonly {
      readonly code: string;
      readonly score: number;
      readonly reason: string;
    }[];
  };
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
  readonly violations: readonly ReaderSummaryQualityRejectionViolation[];
  readonly topReads: readonly ReaderSummaryQualityRejectionTopRead[];
  readonly citations: readonly ReaderSummaryQualityRejectionCitation[];
};
