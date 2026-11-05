import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  isCapturedSourceDisplayTitle,
  isFaithfulReaderSourcePresentation,
} from "../services/reader-post-promotion-title";
import { validDisplayHeadlineSource } from "../services/reader-post-display-headline";
import { isUnpolishedReaderTitle } from "./reader-summary-reader-facing-text-policy";

export const hasValidReaderDisplayTitle = (
  read: Pick<TopRead, "title" | "canonicalUrl" | "providerKey" | "capturedSource" | "displayHeadline">,
  evidence: readonly SummaryEvidenceItem[] = [],
): boolean => {
  if (read.displayHeadline?.status === "accepted") {
    return read.capturedSource !== undefined &&
      validDisplayHeadlineSource(read.displayHeadline, read.capturedSource) &&
      read.displayHeadline.text === read.title;
  }
  if (read.displayHeadline?.status === "unavailable" &&
      read.displayHeadline.reasonCode !== "not_assessed") {
    return false;
  }
  if (isFaithfulReaderSourcePresentation(read, evidence) ||
      isCapturedSourceDisplayTitle(read.title, read.capturedSource, read.providerKey)) {
    return true;
  }
  if (read.capturedSource !== undefined || read.displayHeadline?.status === "unavailable") {
    return false;
  }
  return !(isUnpolishedReaderTitle(read.title) ||
    evidence.some((item) => item.canonicalUrl === read.canonicalUrl));
};
