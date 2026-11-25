export const GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION = 'readability.google-news-resolved.v2';

export const googleNewsArticleId = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'news.google.com' || url.port ||
        url.username || url.password) return undefined;
    const match = /^\/(?:rss\/articles|articles|read)\/([-_a-zA-Z0-9]{1,4096})$/.exec(url.pathname);
    return match?.[1];
  } catch { return undefined; }
};
