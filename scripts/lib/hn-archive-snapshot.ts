import type { SourceRuntimeConfig } from '../../libs/ingestion/ports';

export type HnArchiveSnapshot = Readonly<{
  observedAt: string;
  scope: Readonly<{ tenantId: string; workspaceId: string; sourceBindingId: string; interestId: string; scanPolicyId: string }>;
  config: SourceRuntimeConfig;
  existingIds: ReadonlySet<string>;
}>;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The snapshot is private operator evidence, not independent authentication of its origin. */
export function parseHnArchiveSnapshot(value: unknown): HnArchiveSnapshot {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.observedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.observedAt)) || Date.parse(value.observedAt) > Date.now() ||
      !object(value.scope) || !object(value.config) || !Array.isArray(value.existingIds) || value.existingIds.length > 100_000) {
    throw new Error('HN snapshot invalid');
  }
  const names = ['tenantId', 'workspaceId', 'sourceBindingId', 'interestId', 'scanPolicyId'] as const;
  if (names.some(name => typeof (value.scope as Record<string, unknown>)[name] !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test((value.scope as Record<string, string>)[name]!))) {
    throw new Error('HN snapshot scope invalid');
  }
  const ids = new Set<string>();
  for (const id of value.existingIds) {
    if (typeof id !== 'string' || !/^hn:[1-9]\d*$/u.test(id) || !Number.isSafeInteger(Number(id.slice(3))) || ids.has(id)) {
      throw new Error('HN snapshot identity invalid');
    }
    ids.add(id);
  }
  return { observedAt: value.observedAt, scope: value.scope as HnArchiveSnapshot['scope'],
    config: value.config as SourceRuntimeConfig, existingIds: ids };
}
