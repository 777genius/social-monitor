import { isSensitiveKey, redactSensitiveText, urlContainsCredentials, validateOutboundUrl } from '@social-monitor/shared-kernel';
import { parseRedditSep24Bindings } from '../export-reddit-sep24-public';
import { feedUrlsForTargetWindow } from '@social-monitor/ingestion/adapters/source/rss/rss-source-window';

export const approvedScope = Object.freeze({
  tenantId: '00000000-0000-7000-8000-000000006101',
  workspaceId: '00000000-0000-7000-8000-000000006102',
});
export const sep24Window = Object.freeze({ startInclusive: '2026-09-24T00:00:00.000Z', endExclusive: '2026-09-25T00:00:00.000Z' });
export type Provider = 'reddit' | 'rss';
export type PrivateRefusalCategory = 'scope' | 'configuration' | 'database' | 'filesystem' | 'drift' | 'arguments';
export class PrivateInputRefusal extends Error {
  constructor(readonly category: PrivateRefusalCategory) { super(`private_input_refused:${category}`); }
}
export const refuse = (category: PrivateRefusalCategory): never => { throw new PrivateInputRefusal(category); };
export const prettyBytes = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
export const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return refuse('configuration');
  return value as Record<string, unknown>;
};
export const exactKeys = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  const record = object(value);
  if (Object.keys(record).sort().join('\0') !== [...keys].sort().join('\0')) refuse('configuration');
  return record;
};

/** Refuse unchanged values; never redact a value into a different authentic request. */
export function assertUnprotectedJson(value: unknown, byteLimit = 65_536, capabilityMetadata = false): void {
  let count = 0;
  const visit = (child: unknown, depth: number): void => {
    if (++count > 4096 || depth > 8) refuse('configuration');
    if (typeof child === 'string') {
      if (Buffer.byteLength(child) > 16_384) refuse('configuration');
      // Decoding is validation only: stored bytes and request values remain unchanged.
      let decoded = child;
      const beforeEnvelope = count;
      let largestEnvelope = count;
      for (let index = 0; index < 3; index++) {
        if (redactSensitiveText(decoded) !== decoded || urlContainsCredentials(decoded) ||
          /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|^(?:credential|secret|protected|encrypted)[_-]?(?:ref|reference|value):/iu.test(decoded)) refuse('configuration');
        for (const candidate of decoded.match(/[a-z][a-z0-9+.-]*:\/\/[^\s"<>]+/giu) ?? []) {
          if (urlContainsCredentials(candidate)) refuse('configuration');
        }
        // Validate each container before later decoding can overwrite keys or invalidate quotes.
        const trimmed = decoded.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          let envelope: unknown;
          try { envelope = JSON.parse(decoded) as unknown; } catch { /* Ordinary query prose. */ }
          if (envelope !== undefined) {
            // Decoded alternatives share the remaining graph budget, rather than accumulating visits.
            count = beforeEnvelope;
            visit(envelope, depth + 1);
            largestEnvelope = Math.max(largestEnvelope, count);
          }
        }
        if (index === 2) break;
        try { decoded = decodeURIComponent(decoded); } catch { break; }
      }
      count = largestEnvelope;
    } else if (Array.isArray(child)) {
      if (child.length > 128) refuse('configuration');
      child.forEach((entry) => visit(entry, depth + 1));
    } else if (child !== null && typeof child === 'object') {
      const record = object(child);
      if (Object.keys(record).length > 64) refuse('configuration');
      for (const [key, entry] of Object.entries(record)) {
        if (Buffer.byteLength(key) > 128) refuse('configuration');
        if (['type', 'kind', '__type'].includes(key) && typeof entry === 'string' && /(?:credential|encrypted|protected|secret)/iu.test(entry)) refuse('configuration');
        const capabilityFlag = capabilityMetadata && depth === 0 && typeof entry === 'boolean' &&
          ['requiresCredentials', 'tenantCredentialOverrideSupported', 'tokenRecommended'].includes(key);
        if ((!capabilityFlag && isSensitiveKey(key)) || ['auth', 'authentication'].includes(key.toLowerCase()) ||
          /(?:encrypt|cipher|authTag|keyId|protected|vault|consumer|reference|\$ref|__proto__|constructor)/iu.test(key)) refuse('configuration');
        visit(entry, depth + 1);
      }
    } else if (child !== null && typeof child !== 'boolean' && !(typeof child === 'number' && Number.isFinite(child) &&
      !Object.is(child, -0) && (!Number.isInteger(child) || Number.isSafeInteger(child)))) {
      refuse('configuration');
    }
  };
  visit(value, 0);
  if (prettyBytes(value).length > byteLimit) refuse('configuration');
}

export type SourceSnapshot = Readonly<{
  provider: Provider;
  scope: Readonly<{ tenantId: string; workspaceId: string; interestId: string; sourceBindingId: string; scanPolicyId: string }>;
  catalogId: string;
  interestQuery: string;
  config: Record<string, unknown>;
  policy: Readonly<{ id: string; intervalSeconds: number; freshnessSeconds: number; retryBudget: number; nextRunAt: string }>;
  capability: Readonly<{ id: string; sourceId: string; version: number; schemaVersion: number; config: Record<string, unknown> }>;
}>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export function validateSnapshot(value: unknown): SourceSnapshot {
  const row = exactKeys(value, ['provider', 'scope', 'catalogId', 'interestQuery', 'config', 'policy', 'capability']);
  const scope = exactKeys(row.scope, ['tenantId', 'workspaceId', 'interestId', 'sourceBindingId', 'scanPolicyId']);
  const policy = exactKeys(row.policy, ['id', 'intervalSeconds', 'freshnessSeconds', 'retryBudget', 'nextRunAt']);
  const capability = exactKeys(row.capability, ['id', 'sourceId', 'version', 'schemaVersion', 'config']);
  if (!['reddit', 'rss'].includes(row.provider as string) || scope.tenantId !== approvedScope.tenantId || scope.workspaceId !== approvedScope.workspaceId ||
    [...Object.values(scope), row.catalogId, capability.id, capability.sourceId].some((id) => typeof id !== 'string' || !uuid.test(id)) ||
    policy.id !== scope.scanPolicyId || capability.sourceId !== row.catalogId || typeof row.interestQuery !== 'string') refuse('scope');
  for (const [key, minimum] of [['intervalSeconds', 1], ['freshnessSeconds', 1], ['retryBudget', 0]] as const) {
    if (!Number.isSafeInteger(policy[key]) || (policy[key] as number) < minimum) refuse('scope');
  }
  if (typeof policy.nextRunAt !== 'string' || !Number.isFinite(Date.parse(policy.nextRunAt)) ||
    !Number.isSafeInteger(capability.version) || (capability.version as number) < 1 ||
    !Number.isSafeInteger(capability.schemaVersion) || (capability.schemaVersion as number) < 1) refuse('scope');
  assertUnprotectedJson(row.config);
  assertUnprotectedJson(row.interestQuery, 16_384);
  assertUnprotectedJson(capability.config, 32_768, true);
  object(row.config); object(capability.config);
  return row as unknown as SourceSnapshot;
}

const knownRedditFields = ['scanPasses', 'passes', 'query', 'term', 'mode', 'subreddit', 'listing', 'searchSort', 'minScore', 'maxItems', 'maxItemAgeHours'];
const commonPassFields = ['mode', 'maxItems', 'minScore', 'includeComments', 'maxCommentsPerPost', 'commentDepth', 'commentSort'];
const subset = (record: Record<string, unknown>, keys: readonly string[]): void => {
  if (Object.keys(record).some((key) => !keys.includes(key))) refuse('configuration');
};
function passTypes(pass: Record<string, unknown>): void {
  for (const key of ['query', 'subreddit', 'listing', 'topTime', 'searchSort', 'sort', 'searchTime', 'time', 'commentSort']) {
    if (pass[key] !== undefined && (typeof pass[key] !== 'string' || (pass[key] as string).trim() === '')) refuse('configuration');
  }
  for (const [key, minimum, maximum] of [['maxItems', 1, 100], ['minScore', 0, 1_000_000],
    ['maxCommentsPerPost', 1, 100], ['commentDepth', 0, 10]] as const) {
    if (pass[key] !== undefined && (!Number.isSafeInteger(pass[key]) || (pass[key] as number) < minimum || (pass[key] as number) > maximum)) refuse('configuration');
  }
  if (pass.includeComments !== undefined && typeof pass.includeComments !== 'boolean') refuse('configuration');
  if (pass.commentSort !== undefined && !['confidence', 'top', 'new'].includes(pass.commentSort as string)) refuse('configuration');
}
function redditRequest(snapshot: SourceSnapshot): { request: unknown; passCount: number } {
  const config = snapshot.config;
  subset(config, knownRedditFields);
  passTypes(config);
  for (const key of ['term', 'query']) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' || (config[key] as string).trim() === '')) refuse('configuration');
  }
  if (config.scanPasses !== undefined && config.passes !== undefined) refuse('configuration');
  const passes = config.scanPasses ?? config.passes;
  if (passes !== undefined) {
    if (!Array.isArray(passes) || passes.length < 1 || passes.length > 48) refuse('configuration');
    for (const entry of passes as unknown[]) {
      const pass = object(entry);
      if (pass.mode !== 'listing' && pass.mode !== 'search') refuse('configuration');
      subset(pass, [...commonPassFields, ...(pass.mode === 'listing' ? ['subreddit', 'query', 'listing', 'topTime'] :
        ['query', 'searchSort', 'sort', 'searchTime', 'time', 'topTime', 'allowedSubreddits', 'subreddits'])]);
      passTypes(pass);
      for (const field of ['subreddits', 'allowedSubreddits']) {
        if (pass[field] !== undefined && (!Array.isArray(pass[field]) || (pass[field] as unknown[]).some((name) => typeof name !== 'string' || name.trim() === ''))) refuse('configuration');
      }
    }
  } else if (config.mode !== 'listing' && config.mode !== 'search') refuse('configuration');
  const request = [{ sourceBindingId: snapshot.scope.sourceBindingId, config }];
  try { parseRedditSep24Bindings(request); } catch { refuse('configuration'); }
  return { request, passCount: Array.isArray(passes) ? passes.length : 1 };
}

function safeFeed(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || value.trim() !== value) return refuse('configuration');
  let url: URL;
  try { url = new URL(value); } catch { return refuse('configuration'); }
  if (url.protocol !== 'https:' || url.hash || url.toString() !== value || urlContainsCredentials(value) ||
    redactSensitiveText(value) !== value || !validateOutboundUrl(value, { label: 'Feed', allowedProtocols: ['https:'] }).ok) refuse('configuration');
  return value;
}
function rssRequest(snapshot: SourceSnapshot): { request: unknown; feedCount: number; expandedFeedCount: number } {
  const config = exactKeys(snapshot.config, ['extraFeedUrls', 'feedUrl', 'maxItemAgeHours', 'maxItems', 'mode', 'query']);
  const primary = safeFeed(config.feedUrl);
  if (config.mode !== 'url' || config.query !== primary || !Number.isInteger(config.maxItems) ||
    (config.maxItems as number) < 1 || (config.maxItems as number) > 100 || !Number.isSafeInteger(config.maxItemAgeHours) ||
    (config.maxItemAgeHours as number) < 1 || (config.maxItemAgeHours as number) > 744 ||
    !Array.isArray(config.extraFeedUrls) || config.extraFeedUrls.length !== 24) refuse('configuration');
  const feeds = [primary, ...(config.extraFeedUrls as unknown[]).map(safeFeed)];
  if (new Set(feeds).size !== 25) refuse('configuration');
  // Match the selected consumer's explicit first-12-primary, single-term-extra rule.
  const expected = feeds.flatMap((feed, index) => {
    const parsed = new URL(feed);
    if (parsed.hostname !== 'news.google.com' || parsed.pathname !== '/rss/search') return [feed];
    const queries = parsed.searchParams.getAll('q');
    if (queries.length > 1) return refuse('configuration');
    if (queries.length === 0 || !queries[0]!.trim()) return [feed];
    const terms = queries[0]!.trim().replace(/\bwhen:\d+[dhm]\b/giu, '').replace(/\s+/gu, ' ').trim()
      .split(/\s+OR\s+/iu).map((term) => term.trim());
    if (terms.some((term) => !term || /(?:^|\s)OR(?:\s|$)/iu.test(term)) || (index > 0 && terms.length !== 1)) refuse('configuration');
    return terms.slice(0, 12).map((term) => {
      const historical = new URL(feed);
      historical.searchParams.set('q', `${term} after:2026-09-24 before:2026-09-25`);
      return historical.toString();
    });
  });
  const expanded = feedUrlsForTargetWindow(feeds, { startInclusive: new Date(sep24Window.startInclusive), endExclusive: new Date(sep24Window.endExclusive) });
  if (expanded.length > 36 || new Set(expanded).size !== expanded.length || JSON.stringify(expanded) !== JSON.stringify(expected)) refuse('configuration');
  expanded.forEach(safeFeed);
  const request = { scope: snapshot.scope, bindings: [{ bindingId: snapshot.scope.sourceBindingId, status: 'ENABLED', config }] };
  if (prettyBytes(request).length > 16_384) refuse('configuration');
  return { request, feedCount: 25, expandedFeedCount: expanded.length };
}

export function materializedRequest(snapshot: SourceSnapshot): { bytes: Buffer; passCount: number; feedCount: number; expandedFeedCount: number } {
  const result = snapshot.provider === 'reddit' ? { ...redditRequest(snapshot), feedCount: 0, expandedFeedCount: 0 } : { ...rssRequest(snapshot), passCount: 0 };
  const bytes = prettyBytes(result.request);
  if (bytes.length > 65_536) refuse('configuration');
  return { bytes, passCount: result.passCount, feedCount: result.feedCount, expandedFeedCount: result.expandedFeedCount };
}
