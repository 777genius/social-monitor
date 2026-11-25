export const READER_PROMOTION_PROVIDER_ALIASES = Object.freeze({
  x: Object.freeze(["x", "x-twitter", "twitter"]),
  reddit: Object.freeze(["reddit"]),
  hacker_news: Object.freeze(["hacker_news", "hacker-news", "hn"]),
  github_radar: Object.freeze(["github_radar", "github-repo-radar"]),
});

export type ReaderPromotionProviderFamily =
  keyof typeof READER_PROMOTION_PROVIDER_ALIASES;

export const readerPromotionProviderFamily = (
  providerKey: string,
): ReaderPromotionProviderFamily | undefined => {
  const normalized = providerKey.trim().toLocaleLowerCase("en-US");
  for (const family of Object.keys(READER_PROMOTION_PROVIDER_ALIASES) as
    ReaderPromotionProviderFamily[]) {
    if ((READER_PROMOTION_PROVIDER_ALIASES[family] as readonly string[])
      .includes(normalized)) return family;
  }
  return undefined;
};
