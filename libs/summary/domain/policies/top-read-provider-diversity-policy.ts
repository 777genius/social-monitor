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

const multiProviderDominantShare = 0.4;
