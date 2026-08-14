import { deriveReaderSummaryWeeklyReviewCitationSelector } from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import type { ReaderSummaryWeeklyCanonicalProviderKey } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";

type DailyEvidenceIdentity = Readonly<{
  requested_utc_date: string;
  publication_id: string;
  canonical_sha256: string;
}>;

const providerKeys = new Set<ReaderSummaryWeeklyCanonicalProviderKey>([
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
]);

export const weeklyAtomicCitationSelector = (
  row: DailyEvidenceIdentity,
  provider: Readonly<Record<string, unknown>>,
): string => {
  const providerKey = requiredText(provider, "providerKey");
  if (!providerKeys.has(providerKey as ReaderSummaryWeeklyCanonicalProviderKey)) {
    throw new Error("weekly authority fixture provider must be canonical");
  }
  return deriveReaderSummaryWeeklyReviewCitationSelector({
    requestedUtcDate: row.requested_utc_date,
    publicationId: row.publication_id,
    publicationEvidenceSha256: row.canonical_sha256,
    providerKey: providerKey as ReaderSummaryWeeklyCanonicalProviderKey,
    citationId: requiredText(provider, "citationId"),
    sourceItemId: requiredText(provider, "sourceItemId"),
    sourceContentHash: requiredText(provider, "sourceContentHash"),
  });
};

const requiredText = (
  value: Readonly<Record<string, unknown>>,
  key: string,
): string => {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`weekly authority fixture ${key} is not text`);
  }
  return field;
};
