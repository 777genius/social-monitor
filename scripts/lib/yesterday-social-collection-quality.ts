import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
} from "./clean-real-day-collection-report";

export type YesterdaySocialProviderReadiness = {
  readonly ready: boolean;
  readonly collectionDate: string;
  readonly requiredProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly readyProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly missingProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly duplicateProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly emptyProviderKeys: readonly CleanRealDayCollectionProviderKey[];
  readonly barrierMessage: string | null;
};

type CollectionQualityProviderReport = {
  readonly providerKey: string;
  readonly feedItemCount: number;
};

export type YesterdaySocialCollectionQualityInput = {
  readonly collectionDate: string;
  readonly providerReports: readonly CollectionQualityProviderReport[];
};

export const evaluateYesterdaySocialProviderReadiness = (params: {
  readonly expectedCollectionDate: string;
  readonly report: YesterdaySocialCollectionQualityInput | null;
  readonly requiredProviderKeys?: readonly CleanRealDayCollectionProviderKey[];
}): YesterdaySocialProviderReadiness => {
  const requiredProviderKeys =
    params.requiredProviderKeys ?? defaultCleanRealDayCollectionProviderKeys;
  if (
    params.report === null ||
    params.report.collectionDate !== params.expectedCollectionDate
  ) {
    return {
      ready: false,
      collectionDate: params.expectedCollectionDate,
      requiredProviderKeys,
      readyProviderKeys: [],
      missingProviderKeys: [...requiredProviderKeys],
      duplicateProviderKeys: [],
      emptyProviderKeys: [],
      barrierMessage:
        `Required provider readiness report for ${params.expectedCollectionDate} ` +
        "is missing or belongs to another day",
    };
  }

  const matchesByProvider = new Map<
    CleanRealDayCollectionProviderKey,
    readonly CollectionQualityProviderReport[]
  >();
  for (const providerKey of requiredProviderKeys) {
    matchesByProvider.set(
      providerKey,
      params.report.providerReports.filter(
        (provider) => provider.providerKey === providerKey,
      ),
    );
  }
  const missingProviderKeys = requiredProviderKeys.filter(
    (providerKey) => matchesByProvider.get(providerKey)?.length === 0,
  );
  const duplicateProviderKeys = requiredProviderKeys.filter(
    (providerKey) => (matchesByProvider.get(providerKey)?.length ?? 0) > 1,
  );
  const emptyProviderKeys = requiredProviderKeys.filter((providerKey) => {
    const matches = matchesByProvider.get(providerKey) ?? [];
    return (
      matches.length === 1 &&
      (!Number.isFinite(matches[0]!.feedItemCount) ||
        matches[0]!.feedItemCount <= 0)
    );
  });
  const blocked = new Set([
    ...missingProviderKeys,
    ...duplicateProviderKeys,
    ...emptyProviderKeys,
  ]);
  const readyProviderKeys = requiredProviderKeys.filter(
    (providerKey) => !blocked.has(providerKey),
  );
  const reasons = [
    providerListReason("missing", missingProviderKeys),
    providerListReason("duplicated", duplicateProviderKeys),
    providerListReason("empty", emptyProviderKeys),
  ].filter((reason): reason is string => reason !== null);

  return {
    ready: reasons.length === 0,
    collectionDate: params.report.collectionDate,
    requiredProviderKeys,
    readyProviderKeys,
    missingProviderKeys,
    duplicateProviderKeys,
    emptyProviderKeys,
    barrierMessage:
      reasons.length === 0
        ? null
        : `Required providers are not ready for ${params.expectedCollectionDate}: ${reasons.join(
            "; ",
          )}`,
  };
};

const providerListReason = (
  label: string,
  providerKeys: readonly CleanRealDayCollectionProviderKey[],
): string | null =>
  providerKeys.length === 0 ? null : `${label}=${providerKeys.join(",")}`;
