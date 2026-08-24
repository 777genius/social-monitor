import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  independentEvidenceItems,
  independentEvidenceProviderKeys,
  readerSummaryIndependentProviderFamily,
  readerSummaryProviderIdentity,
} from "../value-objects/reader-summary-provider-identity";
import {
  compactUnique,
  plural,
  uniqueNonEmpty,
} from "../value-objects/summary-text";

export const buildMatchedRules = (
  evidence: readonly SummaryEvidenceItem[],
  interestIds: readonly string[],
  providerKey: string,
): readonly string[] => {
  const explicitRules = evidence.flatMap((item) => item.matchedRules ?? []);
  const fallbackRules = [
    ...interestIds.map((interestId) => `interest:${interestId}`),
    ...evidence.map((item) => `source-binding:${item.sourceBindingId}`),
    `provider:${providerKey}`,
  ];

  return compactUnique([...explicitRules, ...fallbackRules]);
};

export const buildWhyNow = (
  cluster: StoryCluster | undefined,
  providerKeys: readonly string[],
  evidence: readonly SummaryEvidenceItem[],
): string => {
  const independentEvidence = independentEvidenceItems(evidence);
  const evidenceIdentities = independentEvidence.map((item) => ({
    family: readerSummaryIndependentProviderFamily(item),
    identity: readerSummaryProviderIdentity(item),
  }));
  const clusterProviderKeys = multiProviderClusterKeys(cluster);
  const providerNamesByKey = new Map(
    evidenceIdentities.map(
      ({ family, identity }) => [family, identity.providerName] as const,
    ),
  );
  const providers = uniqueNonEmpty(
    evidenceIdentities.length > 0
      ? [
          ...providerKeys.map((providerKey) =>
            readerSummaryIndependentProviderFamily({ providerKey })),
          ...evidenceIdentities.map(({ family }) => family),
        ]
      : clusterProviderKeys.length > 0
        ? clusterProviderKeys
        : [...(cluster?.providerKeys ?? []), ...providerKeys].map(
            (providerKey) =>
              readerSummaryIndependentProviderFamily({ providerKey }),
          ),
  ).map((providerKey) => providerNamesByKey.get(providerKey) ?? providerKey);
  const duplicateCount = cluster?.duplicateFeedItemIds.length ?? 0;
  const interestCount =
    cluster?.interestIds.length ??
    uniqueNonEmpty(evidence.map((item) => item.interestId)).length;
  const coverage =
    providers.length > 1
      ? `Current summary window has cross-source coverage from ${providers.slice(0, 3).join(", ")}`
      : `Current summary window has ${providers[0] ?? "source"} coverage`;
  const duplicateText =
    duplicateCount === 0
      ? ""
      : ` and linked ${duplicateCount} related item${plural(duplicateCount)}`;
  const interestText =
    interestCount > 1 ? ` across ${interestCount} interests` : "";

  return `${coverage}${interestText}${duplicateText}.`;
};

export const confirmedProviderKeys = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly providerKey: string;
}): readonly string[] => {
  const evidenceProviderKeys = independentEvidenceProviderKeys(params.evidence);
  const clusterProviderKeys = multiProviderClusterKeys(params.cluster);
  const providerKeys = uniqueNonEmpty(
    evidenceProviderKeys.length > 0
      ? evidenceProviderKeys
      : clusterProviderKeys.length > 0
        ? clusterProviderKeys
        : [readerSummaryIndependentProviderFamily({
            providerKey: params.providerKey,
          })],
  );

  return providerKeys.length > 0
    ? providerKeys
    : [readerSummaryIndependentProviderFamily({
        providerKey: params.providerKey,
      })];
};

export const multiProviderClusterKeys = (
  cluster: StoryCluster | undefined,
): readonly string[] => {
  const providerKeys = compactUnique((cluster?.providerKeys ?? []).map(
    (providerKey) => readerSummaryIndependentProviderFamily({ providerKey }),
  ));

  return providerKeys.length > 1 ? providerKeys : [];
};
