import { hasValidReaderDisplayTitle } from "./reader-display-title-quality";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  isFallbackReaderReason,
  isReaderTitleReasonDuplicate,
} from "./reader-summary-reader-facing-text-policy";
import type { ReaderSummaryEditorialPriorityProfile } from
  "./reader-summary-editorial-priority-policy";
import { hasReaderSummaryEditorialCurationRule } from "./reader-summary-editorial-curation-policy";

export type RenderedTopReadCandidate = {
  readonly story: TopReadCandidate;
  readonly topRead: TopRead;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly editorialPriority?: ReaderSummaryEditorialPriorityProfile;
};

export type ReaderFacingTopReadQualityInput = Pick<
  TopRead,
  | "title"
  | "displayHeadline"
  | "capturedSource"
  | "reason"
  | "providerKey"
  | "canonicalUrl"
  | "signalScore"
  | "confidence"
  | "confirmedProviderKeys"
  | "matchedRules"
>;

export const isReaderFacingQualityTopRead = (
  read: ReaderFacingTopReadQualityInput,
  evidence: readonly SummaryEvidenceItem[] = [],
): boolean => {
  if (
    !hasValidReaderDisplayTitle(read, evidence) ||
    hasFallbackReason(read) ||
    isReaderTitleReasonDuplicate(read.title, read.reason)
  ) {
    return false;
  }
  if (isUnsupportedSingleSourceXClaim(read)) {
    return false;
  }
  if (!socialNewsProviderKeys.has(read.providerKey)) {
    return true;
  }
  if (
    read.confirmedProviderKeys.length > 1 ||
    read.confidence.level !== "low"
  ) {
    return true;
  }
  if (isTrustedOfficialXPost(read)) {
    return true;
  }
  if (read.signalScore >= strongSingleSourceSignalScore) {
    return true;
  }
  if (read.signalScore >= usefulSingleSourceSignalScore) {
    return true;
  }
  if (isDetailedCuratedDiscussion(read)) {
    return true;
  }

  return false;
};

const isDetailedCuratedDiscussion = (
  read: ReaderFacingTopReadQualityInput,
): boolean =>
  hasReaderSummaryEditorialCurationRule(read.matchedRules) &&
  curatedDiscussionProviderKeys.has(read.providerKey) &&
  read.signalScore >= minimumCuratedSingleSourceSignalScore &&
  read.reason.trim().length >= minimumCuratedReasonLength;

const isTrustedOfficialXPost = (
  read: ReaderFacingTopReadQualityInput,
): boolean => {
  if (read.providerKey !== "x-twitter") {
    return false;
  }
  const username = xUsername(read.canonicalUrl);

  return username !== undefined && trustedXUsernames.has(username);
};

const isUnsupportedSingleSourceXClaim = (
  read: ReaderFacingTopReadQualityInput,
): boolean =>
  read.providerKey === "x-twitter" &&
  read.confirmedProviderKeys.length <= 1 &&
  (/(?:^(?:unverified report:)|\b(?:breaking|just\s+in)\b)/iu.test(
    read.title,
  ) ||
    unsupportedClaimLanguage(`${read.title} ${read.reason}`));

const unsupportedClaimLanguage = (value: string): boolean =>
  unsupportedClaimPatterns.some((pattern) => pattern.test(value));

const unsupportedClaimPatterns = [
  /\b(?:there\s+(?:is|was)|(?:the|this|that)\s+(?:claim|report|story|post|assertion)\s+(?:has|provides|includes))\s+no\s+supporting\s+evidence\b/iu,
  /\b(?:claim|report|story|post|assertion)\s+(?:remains|is|appears|seems)\s+(?:an?\s+)?rumou?r[-\s]+like\b/iu,
  /\b(?:treat|consider)\s+(?:the|this|that)?\s*(?:claim|report|story|post|assertion)\s+as\s+unverified\b/iu,
  /\b(?:claim|report|story|post|assertion)\b.{0,80}\bunless\s+corroborated\b/iu,
  /\b(?:claim|report|story|post|assertion|deadline)\s+needs?\s+stronger\s+confirmation\b/iu,
  /\b(?:claim|report|story|post|assertion)\b.{0,80}\b(?:(?:cannot|could\s+not)\s+be|has\s+not\s+been|is\s+not)\s+(?:independently\s+verified|verified(?:\s+independently)?)\b/iu,
  /\b(?:claim|report|story|post|assertion)\s+(?:is|remains|was)\s+not\s+(?:independently\s+)?(?:confirmed|corroborated|verified)\b/iu,
  /\b(?:claim|report|story|post|assertion)\s+(?:does|did)\s+not\s+(?:provide|include|cite)\s+(?:any\s+)?supporting\s+evidence\b/iu,
] as const;

const hasFallbackReason = (read: ReaderFacingTopReadQualityInput): boolean =>
  isFallbackReaderReason(read.reason);

const xUsername = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== "x.com" && hostname !== "twitter.com") {
      return undefined;
    }

    return parsed.pathname
      .split("/")
      .filter((segment) => segment.length > 0)[0]
      ?.toLowerCase();
  } catch {
    return undefined;
  }
};

const socialNewsProviderKeys = new Set([
  "x-twitter",
  "reddit",
  "hacker-news",
  "rss",
]);

const trustedXUsernames = new Set([
  "anthropicai",
  "cloudflare",
  "cursor_ai",
  "github",
  "googledeepmind",
  "mistralai",
  "openai",
]);
const strongSingleSourceSignalScore = 2.2;
const usefulSingleSourceSignalScore = 1.9;
const minimumCuratedSingleSourceSignalScore = 1.65;
const minimumCuratedReasonLength = 280;
const curatedDiscussionProviderKeys = new Set(["reddit", "hacker-news"]);
