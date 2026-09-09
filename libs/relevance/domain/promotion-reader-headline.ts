export type PromotionEvidenceReference = Readonly<{
  field: "title" | "bodyPreview";
  start: number;
  end: number;
  quote: string;
}>;

export type PromotionHeadlineQualification = Readonly<{
  phrase: string;
  evidence: readonly PromotionEvidenceReference[];
}>;

export type PromotionHeadlineUnavailableReason =
  | "not_assessed" | "invalid_assessment" | "incomplete_source"
  | "unsafe_text" | "unresolved_qualifications" | "insufficient_support";

export type PromotionReaderHeadline = Readonly<{
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
  support: readonly PromotionEvidenceReference[];
  qualifications: readonly PromotionHeadlineQualification[];
  confidence: number;
  wholeInput: Readonly<{
    titleLength: number; bodyLength: number;
    qualificationJudgment: "none" | "preserved" | "subject_only";
  }>;
}> | Readonly<{
  status: "unavailable";
  reasonCode: PromotionHeadlineUnavailableReason;
}>;

export const unavailablePromotionHeadline = (
  reasonCode: PromotionHeadlineUnavailableReason,
): PromotionReaderHeadline => Object.freeze({ status: "unavailable", reasonCode });

// JSON persistence must not silently repair digest-bound UTF-16 material.
export const isRoundTrippingHeadlineText = (text: string): boolean =>
  !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);

export const isConcisePromotionHeadline = (text: unknown): text is string =>
  typeof text === "string" && text.length >= 1 && text.length <= 119 &&
  text === text.trim() && isRoundTrippingHeadlineText(text) &&
  !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069<>]|https?:\/\/|\.\.\.|…/u.test(text);
