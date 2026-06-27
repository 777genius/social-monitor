import { isSensitiveKey } from '@social-monitor/shared-kernel';

import type {
  SourceTargetCatalogPort,
  SourceTargetDescriptor,
  SourceTargetValidationResult,
} from '../../ports';
import type { SourceTargetKind } from '../../domain';

type ProviderTargetRule = {
  readonly kind: SourceTargetKind;
  readonly normalize: (value: string) => string | null;
};

const providerRules = new Map<string, readonly ProviderTargetRule[]>([
  ['reddit', [
    { kind: 'subreddit', normalize: normalizeSubreddit },
    { kind: 'search_query', normalize: normalizeSearchQuery },
  ]],
  ['github', [
    { kind: 'repository', normalize: normalizeGithubRepository },
    { kind: 'search_query', normalize: normalizeSearchQuery },
  ]],
  ['x-twitter', [
    { kind: 'topic', normalize: normalizeSearchQuery },
    { kind: 'search_query', normalize: normalizeSearchQuery },
    { kind: 'account', normalize: normalizeHandle },
  ]],
  ['rss', [
    { kind: 'url', normalize: normalizeUrl },
  ]],
  ['hacker-news', [
    { kind: 'topic', normalize: normalizeSearchQuery },
    { kind: 'search_query', normalize: normalizeSearchQuery },
  ]],
]);

const providerAliases = new Map<string, string>([
  ['x-twitter-experimental-daily', 'x-twitter'],
]);

export class StaticSourceTargetCatalogAdapter implements SourceTargetCatalogPort {
  validateTarget(params: {
    readonly providerKey: string;
    readonly targetKind: string;
    readonly targetValue: string;
    readonly config: Readonly<Record<string, unknown>>;
  }): SourceTargetValidationResult {
    const providerKey = canonicalProviderKey(params.providerKey);
    const rules = providerRules.get(providerKey);

    if (rules === undefined) {
      return { ok: false, reason: `Unsupported source target provider: ${providerKey}` };
    }

    const targetKind = params.targetKind.trim() as SourceTargetKind;
    const rule = rules.find((candidate) => candidate.kind === targetKind);

    if (rule === undefined) {
      return { ok: false, reason: `Unsupported ${providerKey} target kind: ${params.targetKind}` };
    }

    const normalizedValue = rule.normalize(params.targetValue);
    if (normalizedValue === null) {
      return { ok: false, reason: `Invalid ${providerKey} ${targetKind} target value` };
    }

    const inlineCredentialField = findInlineCredentialField(params.config);
    if (inlineCredentialField !== null) {
      return {
        ok: false,
        reason: `Source target config must reference stored credentials instead of inline credential field: ${inlineCredentialField}`,
      };
    }

    return {
      ok: true,
      descriptor: {
        providerKey,
        targetKind,
        targetValue: normalizeDisplayValue(targetKind, normalizedValue),
        normalizedKey: `${providerKey}:${targetKind}:${normalizedValue}`,
        config: normalizeConfig(params.config),
      } satisfies SourceTargetDescriptor,
    };
  }
}

const canonicalProviderKey = (providerKey: string): string => {
  const normalized = providerKey.trim().toLowerCase();

  return providerAliases.get(normalized) ?? normalized;
};

function normalizeSubreddit(value: string): string | null {
  const normalized = value.replace(/^r\//i, '').trim().toLowerCase();

  return /^[a-z0-9_]{2,21}$/.test(normalized) ? normalized : null;
}

function normalizeGithubRepository(value: string): string | null {
  const normalized = value
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .trim()
    .toLowerCase();

  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(normalized) ? normalized : null;
}

function normalizeHandle(value: string): string | null {
  const normalized = value.replace(/^@/, '').trim().toLowerCase();

  return /^[a-z0-9_]{1,30}$/.test(normalized) ? normalized : null;
}

function normalizeSearchQuery(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');

  return normalized.length >= 2 && normalized.length <= 500 ? normalized.toLowerCase() : null;
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const normalizeDisplayValue = (targetKind: SourceTargetKind, normalizedValue: string): string => {
  if (targetKind === 'subreddit') {
    return normalizedValue;
  }

  return normalizedValue;
};

const normalizeConfig = (config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(config).map(([key, value]) => [key, normalizeConfigValue(value)]));

const normalizeConfigValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeConfigValue(item));
  }

  if (typeof value === 'object') {
    return normalizeConfig(value as Readonly<Record<string, unknown>>);
  }

  return String(value);
};

const findInlineCredentialField = (
  config: Readonly<Record<string, unknown>>,
): string | null => {
  for (const [key, value] of Object.entries(config)) {
    const field = findInlineCredentialFieldValue(key, value);
    if (field !== null) {
      return field;
    }
  }

  return null;
};

const findInlineCredentialFieldValue = (key: string, value: unknown): string | null => {
  if (key === 'sourceCredentialId') {
    return null;
  }

  if (key === 'credentialRef') {
    return validateCredentialRef(value);
  }

  if (isSensitiveKey(key)) {
    return key;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const field = findInlineCredentialFieldValue(key, item);
      if (field !== null) {
        return field;
      }
    }
  }

  if (isRecord(value)) {
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const field = findInlineCredentialFieldValue(`${key}.${nestedKey}`, nestedValue);
      if (field !== null) {
        return field;
      }
    }
  }

  return null;
};

const validateCredentialRef = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return 'credentialRef';
  }

  for (const key of Object.keys(value)) {
    if (key !== 'id' && key !== 'sourceCredentialId') {
      return `credentialRef.${key}`;
    }
  }

  return null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
