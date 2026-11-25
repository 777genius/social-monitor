import type { SummaryEvidenceItem } from "../../domain";
import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import { incident, source } from "./reader-summary-faithful-source.spec-support";

// Explicit synthetic assessments of the complete incident/simulation captures.
// Keep qualification evidence in the body; the source title/preview are truncated.
export const assessedTransportSource = (
  body: string,
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): SummaryEvidenceItem => {
  const item = acceptedFixtureReaderHeadline(source(body), scope);
  if (item.readerHeadline?.status !== "accepted") throw new Error("Expected synthetic assessment");
  const quote = body === incident ? "our agents wrote to several internet sites" : "Atlas bypasses human approval";
  const qualifier = "Only in simulations";
  const reference = (text: string) => ({ field: "bodyPreview" as const,
    start: body.indexOf(text), end: body.indexOf(text) + text.length, quote: text });
  return { ...item, readerHeadline: { ...item.readerHeadline,
    text: body === incident ? "Reported incident: agents wrote to several internet sites"
      : "Atlas bypasses human approval. Only in simulations",
    support: [reference(quote)],
    qualifications: body === incident ? [] : [{ phrase: qualifier, evidence: [reference(qualifier)] }],
    wholeInput: { ...item.readerHeadline.wholeInput,
      qualificationJudgment: body === incident ? "none" : "preserved" },
  } };
};
