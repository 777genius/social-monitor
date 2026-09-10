/** Private observation only; never part of a headline or ranking result. */
export type PromotionHeadlineReasonOrigin =
  | "not_assessed" | "invalid_binding" | "request_truncated" | "request_length"
  | "request_availability" | "input_unsafe" | "model_incomplete_source"
  | "model_unresolved_qualifications" | "model_insufficient_support"
  | "invalid_proposal" | "whole_input_shape" | "whole_input_count"
  | "headline_unsafe" | "invalid_qualification" | "reference_budget"
  | "claim_qualification" | "subject_support" | "accepted";

export type PromotionHeadlineDiagnostic = Readonly<{
  reasonOrigin: PromotionHeadlineReasonOrigin;
  reviewedTitleUtf16: number;
  reviewedBodyUtf16: number;
  availability: "title_only" | "body_present" | "truncated" | "unknown";
  wholeInputShape: boolean | null;
  titleCountEqual: boolean | null;
  bodyCountEqual: boolean | null;
}>;

export type PromotionHeadlineDiagnosticObserver = (
  candidateId: string, diagnostic: PromotionHeadlineDiagnostic,
) => void | Promise<void>;
