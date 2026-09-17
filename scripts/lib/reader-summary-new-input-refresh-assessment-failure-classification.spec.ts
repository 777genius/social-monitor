import { SourceContentAssessmentStageError } from "@social-monitor/relevance/ports";
import { classifyAssessmentReviewBatchFailure } from "./reader-summary-new-input-refresh-assessment";

describe("assessment reviewBatch failure classification precedence", () => {
  it("prioritizes a binding stage over a coincidentally exceeded deadline", () => {
    const error = new SourceContentAssessmentStageError("binding", "synthetic binding mismatch");
    expect(classifyAssessmentReviewBatchFailure({ error, aborted: false, deadlineExceeded: true })).toBe("binding");
    expect(classifyAssessmentReviewBatchFailure({ error, aborted: true, deadlineExceeded: true })).toBe("binding");
  });

  it("prioritizes a verdict stage the same way, never masked by an incidental abort", () => {
    const error = new SourceContentAssessmentStageError("verdict", "synthetic verdict rejection");
    expect(classifyAssessmentReviewBatchFailure({ error, aborted: true, deadlineExceeded: false })).toBe("verdict");
  });

  it("falls back to the documented aborted-then-deadline-then-unknown priority for an untyped error", () => {
    const error = new Error("synthetic untyped failure");
    expect(classifyAssessmentReviewBatchFailure({ error, aborted: true, deadlineExceeded: true })).toBe("aborted");
    expect(classifyAssessmentReviewBatchFailure({ error, aborted: false, deadlineExceeded: true })).toBe("deadline");
    expect(classifyAssessmentReviewBatchFailure({ error, aborted: false, deadlineExceeded: false })).toBe("unknown");
  });
});
