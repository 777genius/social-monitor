import type { SummaryEvidenceItem } from "../../domain/value-objects/summary-evidence-item";
import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";

export const acceptedDeterministicFixtureHeadline = (
  item: SummaryEvidenceItem,
): SummaryEvidenceItem => {
  const assessed = acceptedFixtureReaderHeadline(
    // These synthetic bodies are complete captures, not truncated previews.
    { ...item, sourceText: item.bodyPreview },
    {
      tenantId: "tenant-deterministic-reader-summary-adapter",
      workspaceId: "workspace-deterministic-reader-summary-adapter",
    },
  );
  const qualification = "Preview deployments remain limited to test workspaces.";
  const qualifiedTitle = `Developers compare runtime isolation tradeoffs.\n\n${qualification}`;
  if (item.title !== qualifiedTitle || assessed.readerHeadline?.status !== "accepted") {
    return assessed;
  }
  // Explicit synthetic assessment: retain the entire limitation in a concise
  // display title while the source-bound capture keeps both original paragraphs.
  return { ...assessed, readerHeadline: {
    ...assessed.readerHeadline,
    text: item.title.replace("\n\n", " "),
    qualifications: [{ phrase: qualification, evidence: [{
      field: "title", start: item.title.indexOf(qualification),
      end: item.title.length, quote: qualification,
    }] }],
    wholeInput: { ...assessed.readerHeadline.wholeInput, qualificationJudgment: "preserved" },
  } };
};
