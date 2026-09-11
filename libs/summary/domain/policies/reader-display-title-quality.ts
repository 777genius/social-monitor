import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isFaithfulReaderSourcePresentation } from "../services/reader-post-promotion-title";
import { validDisplayHeadlineSource } from "../services/reader-post-display-headline";
import { isUnpolishedReaderTitle } from "./reader-summary-reader-facing-text-policy";

export const hasValidReaderDisplayTitle = (
  read: Pick<TopRead, "title" | "canonicalUrl" | "providerKey" | "capturedSource" | "displayHeadline">,
  evidence: readonly SummaryEvidenceItem[],
): boolean => read.displayHeadline === undefined
  ? (!(isUnpolishedReaderTitle(read.title) ||
      evidence.some((item) => item.canonicalUrl === read.canonicalUrl)) ||
      isFaithfulReaderSourcePresentation(read, evidence))
  : read.capturedSource !== undefined &&
    validDisplayHeadlineSource(read.displayHeadline, read.capturedSource) &&
    read.displayHeadline.text === read.title;
