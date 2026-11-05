import { sanitizeUrlCredentials } from '@social-monitor/shared-kernel';
import { hasRedditMediaContext } from './reddit-media-context';
import type { CaptureText } from './source-content-capture';

/** Runtime egress URL and credential policy, independent of durable capture encoding. */
export const ARTICLE_FETCH_POLICY_VERSION = 'article_fetch_policy.v1';
export const markLiveArticleCredentialsRequired = <T extends CaptureText>(item: T): T => ({
  ...item,
  metadata: {
    ...item.metadata,
    articleFetchPolicy: {
      version: ARTICLE_FETCH_POLICY_VERSION,
      liveUrlRequired: true,
    },
  },
});

export const requiresLiveArticleCredentials = (item: CaptureText): boolean => {
  const policy = item.metadata?.articleFetchPolicy;
  return typeof policy === 'object' && policy !== null && !Array.isArray(policy) &&
    'version' in policy && policy.version === ARTICLE_FETCH_POLICY_VERSION &&
    'liveUrlRequired' in policy && policy.liveUrlRequired === true;
};
/**
 * The URL used at fetch time deliberately retains its query string. Signed
 * article URLs are valid egress inputs, but are never a durable capture
 * identity. Callers must use articleRequestUrl for anything persisted.
 */
export const articleFetchUrl = (providerKey: string, item: CaptureText): string | undefined => {
  if (providerKey === 'reddit' && hasRedditMediaContext(item.metadata)) return undefined;
  if (providerKey === 'rss' && item.metadata?.nativeContentComplete === true && item.body.trim().length > 0) return undefined;
  const candidate = providerKey === 'hacker-news' ? item.metadata?.externalUrl
    : providerKey === 'reddit' ? item.metadata?.linkedUrl
      : providerKey === 'rss' ? item.canonicalUrl : undefined;
  if (typeof candidate !== 'string') return undefined;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    if (['news.ycombinator.com', 'reddit.com', 'www.reddit.com', 'old.reddit.com'].includes(url.hostname)) return undefined;
    url.hash = '';
    return url.toString();
  } catch { return undefined; }
};

/** A credential-free, stable article identity suitable for durable metadata. */
export const articleRequestUrl = (providerKey: string, item: CaptureText): string | undefined => {
  const url = articleFetchUrl(providerKey, item);
  return url === undefined ? undefined : sanitizeCaptureUrl(url);
};

/**
 * Capture URLs are stored and hashed with content provenance. Keep ordinary
 * query parameters (they can identify an article), but discard credential-like
 * parameters, userinfo and fragments before that representation is created.
 */
export const sanitizeCaptureUrl = (value: string): string => {
  return sanitizeUrlCredentials(value);
};

