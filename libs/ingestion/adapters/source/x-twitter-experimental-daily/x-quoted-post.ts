import type { XDailyCollectedPost } from "./x-daily-collector-client.port";

/** Keep the embedded author separate; a quote never lends its metrics to the parent. */
export const validatedXQuotedPost = (value: NonNullable<XDailyCollectedPost["quotedPost"]> | undefined,
  parentId: string, parentPublishedAt: Date): XDailyCollectedPost["quotedPost"] => {
  if (value === undefined || !/^[1-9][0-9]{0,19}$/u.test(value.tweetId) ||
      value.tweetId === parentId || !/^[A-Za-z0-9_]{1,15}$/u.test(value.authorHandle) ||
      !value.text.trim() || Buffer.byteLength(value.text) > 256_000 ||
      !Number.isFinite(value.publishedAt.getTime()) || value.publishedAt > parentPublishedAt) return undefined;
  let url: URL;
  try { url = new URL(value.canonicalUrl); } catch { return undefined; }
  if (url.protocol !== "https:" || !["x.com", "twitter.com"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname.toLowerCase() !== `/${value.authorHandle}/status/${value.tweetId}`.toLowerCase()) return undefined;
  return { ...value, canonicalUrl: `https://x.com/${value.authorHandle}/status/${value.tweetId}` };
};
