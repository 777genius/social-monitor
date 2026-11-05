export type SummaryHeadlineReference = Readonly<{
  field: "title" | "bodyPreview";
  start: number;
  end: number;
  quote: string;
}>;

export type SummaryHeadlineQualification = Readonly<{
  phrase: string;
  evidence: readonly SummaryHeadlineReference[];
}>;

export type SummaryHeadlineUnavailableReason =
  | "not_assessed" | "invalid_assessment" | "incomplete_source"
  | "unsafe_text" | "unresolved_qualifications" | "insufficient_support";

export type SummaryReaderHeadline = Readonly<{
  status: "accepted";
  kind: "claim" | "subject_label";
  text: string;
  binding: Readonly<{
    candidateId: string; providerKey: string;
    tenantId: string; workspaceId: string; interestId: string;
    sourceBindingId: string; sourceItemId: string; trustedIntent: string;
    availability: "title_only" | "body_present";
    reviewedInputDigest: string;
  }>;
  support: readonly SummaryHeadlineReference[];
  qualifications: readonly SummaryHeadlineQualification[];
  confidence: number;
  wholeInput: Readonly<{
    titleLength: number; bodyLength: number;
    qualificationJudgment: "none" | "preserved" | "subject_only";
  }>;
}> | Readonly<{
  status: "unavailable";
  reasonCode: SummaryHeadlineUnavailableReason;
}>;

export type ReaderCapturedSource = Readonly<{
  title: string;
  /** Exact full available safety-processed capture; absent means unavailable. */
  body?: string;
  captureAvailability: "available" | "unavailable";
  reviewAvailability: "body_present" | "title_only" | "unavailable";
}>;

export type ReaderDisplayHeadline = SummaryReaderHeadline;
export type ReaderDisplayHeadlineSeal = Readonly<{
  headline: ReaderDisplayHeadline;
  /** Present only for accepted authority. */
  capturedSourceDigest?: string;
}>;
