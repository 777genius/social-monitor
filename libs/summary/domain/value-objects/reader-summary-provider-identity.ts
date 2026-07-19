import type { SummaryEvidenceItem } from "./summary-evidence-item";
import { compactUnique } from "./summary-text";

export type ReaderSummaryProviderIdentity = {
  readonly providerKey: string;
  readonly providerName: string;
};

export const readerSummaryProviderIdentity = (params: {
  readonly providerKey: string;
  readonly providerName?: string;
  readonly canonicalUrl?: string;
}): ReaderSummaryProviderIdentity => {
  if (
    params.providerKey === "rss" &&
    isHackerNewsCanonicalUrl(params.canonicalUrl)
  ) {
    return {
      providerKey: "hacker-news",
      providerName: params.providerName ?? params.providerKey,
    };
  }

  return {
    providerKey: params.providerKey,
    providerName: params.providerName ?? params.providerKey,
  };
};

export const independentEvidenceProviderKeys = (
  evidence: readonly SummaryEvidenceItem[],
): readonly string[] =>
  compactUnique(
    independentEvidenceItems(evidence).map(
      (item) => readerSummaryProviderIdentity(item).providerKey,
    ),
  );

export const independentEvidenceItems = (
  evidence: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const originKeys = new Set<string>();
  const result: SummaryEvidenceItem[] = [];

  for (const item of evidence) {
    const originKey = normalizedSourceOriginKey(item);
    if (originKey !== undefined && originKeys.has(originKey)) {
      continue;
    }

    if (originKey !== undefined) {
      originKeys.add(originKey);
    }
    result.push(item);
  }

  return result;
};

export const normalizedSourceOriginKey = (
  evidence: Pick<SummaryEvidenceItem, "canonicalUrl" | "sourceOriginUrl">,
): string | undefined =>
  normalizeOriginUrl(evidence.sourceOriginUrl ?? evidence.canonicalUrl);

const isHackerNewsCanonicalUrl = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === "news.ycombinator.com";
  } catch {
    return false;
  }
};

const normalizeOriginUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (trackingQueryParameterPattern.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/u, "");
    }

    return url.toString();
  } catch {
    return undefined;
  }
};

const trackingQueryParameterPattern =
  /^(?:fbclid|gclid|mc_cid|mc_eid|ref|source|utm_.+)$/iu;
