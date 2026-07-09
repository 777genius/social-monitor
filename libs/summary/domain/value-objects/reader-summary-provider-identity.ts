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
      providerName: "Hacker News via RSS",
    };
  }

  return {
    providerKey: params.providerKey,
    providerName: params.providerName ?? params.providerKey,
  };
};

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
