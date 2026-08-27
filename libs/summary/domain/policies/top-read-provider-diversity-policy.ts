export const topReadProviderCapForLimit = (params: {
  readonly limit: number;
  readonly activeProviderCount: number;
  readonly primaryMinimum: number;
}): number => {
  if (params.activeProviderCount <= 1) {
    return params.limit;
  }

  const dominantShare =
    params.activeProviderCount >= 3 ? multiProviderDominantShare : 0.6;

  return Math.max(
    params.primaryMinimum,
    Math.floor(params.limit * dominantShare),
  );
};

export const topReadPrimaryMinimumForLimit = (limit: number): number =>
  limit >= 8 ? 2 : 1;

export const readerPostPromotionTopProviderCap = (
  activeProviderCount: number,
): number => topReadProviderCapForLimit({
  limit: promotionRankingAuditLimit,
  activeProviderCount,
  primaryMinimum: topReadPrimaryMinimumForLimit(
    promotionRankingAuditLimit,
  ),
});

const multiProviderDominantShare = 0.4;

// Promotion V1 audits the reader surface against ten editorial slots even
// though the published Top array exposes at most eight.
const promotionRankingAuditLimit = 10;
