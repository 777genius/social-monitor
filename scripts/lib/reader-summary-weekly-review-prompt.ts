import {
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyReviewResponseSchemaVersion,
  type ReaderSummaryWeeklyReviewAuthority,
  type ReaderSummaryWeeklyReviewStoryCandidate,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";

export type ReaderSummaryWeeklyReviewPrompt = Readonly<{
  systemPrompt: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
}>;

export const readerSummaryWeeklyReviewInstructions = [
  "You review only the sealed weekly candidate stories supplied in the prompt.",
  "Return only the requested structured response.",
  "The top-level object must contain exactly schemaVersion and selections; do not return responseSchemaVersion, sealId, findings, type, or selector fields.",
  "Every story and citation selector must be copied exactly from the supplied candidates.",
  "Do not create prose, story identities, citations, dates, hashes, or code bindings.",
  "Use observation for a supported finding; evolution requires before and after selectors on different dates; resolution requires a terminal selector.",
].join("\n");

export const readerSummaryWeeklyReviewPromptCandidateLimit = 256;

export const buildReaderSummaryWeeklyReviewPrompt = (params: Readonly<{
  authority: ReaderSummaryWeeklyReviewAuthority;
  candidates: readonly ReaderSummaryWeeklyReviewStoryCandidate[];
  outputSchema: Record<string, unknown>;
}>): ReaderSummaryWeeklyReviewPrompt => {
  const promptBody = deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.weekly_review_prompt.v1",
    purpose: "social_monitor.reader_summary.weekly.review.v2",
    responseSchemaVersion: readerSummaryWeeklyReviewResponseSchemaVersion,
    sealId: params.authority.sealId,
    sealSha256: params.authority.sealSha256,
    tenantId: params.authority.tenantId,
    workspaceId: params.authority.workspaceId,
    scope: params.authority.scope,
    weekStartedOn: params.authority.weekStartedOn,
    weekEndedOn: params.authority.weekEndedOn,
    candidates: params.candidates
      .slice(0, readerSummaryWeeklyReviewPromptCandidateLimit)
      .map((candidate) => ({
      story: candidate.story,
      citations: candidate.citations.map((citation) => ({
        selector: citation.selector,
        requestedUtcDate: citation.requestedUtcDate,
        providerKey: citation.providerKey,
        title: citation.title,
        sourceText: citation.sourceText,
      })),
      })),
  });
  return deepFreezeReaderSummaryWeekly({
    systemPrompt: readerSummaryWeeklyReviewInstructions,
    prompt: canonicalizeReaderSummaryWeeklyJson(
      promptBody,
      "weekly review prompt",
    ).json,
    outputSchema: params.outputSchema,
  });
};
