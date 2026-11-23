import type { SourceProviderPort, SourceProviderScanContext, SourceQuery, SourceRuntimeConfig } from '../../libs/ingestion/ports';
import type { HackerNewsScanPass } from '../../libs/ingestion/adapters/source/hacker-news/hacker-news-scan-pass-support';

/** Identity discovery reuses the configured lanes; comment content is materialized separately. */
export function configuredHnArchiveScan(input: {
  readonly provider: SourceProviderPort;
  readonly context: SourceProviderScanContext;
  readonly passes: readonly HackerNewsScanPass[];
}): (from: Date, to: Date) => ReturnType<SourceProviderPort['scan']> {
  const original = input.context.config;
  const raw = original?.scanPasses ?? original?.passes;
  if (original === undefined || !Array.isArray(raw) || raw.length === 0 || raw.length !== input.passes.length ||
      input.provider.key() !== 'hacker-news') throw new Error('HN discovery requires all configured passes');
  const value = original.query ?? original.term ?? original.topic;
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('HN discovery query unavailable');
  const query: SourceQuery = { mode: original.mode === 'listing' ? 'listing' : 'search', query: value };
  if (!input.provider.validateBinding(query).ok) throw new Error('HN discovery binding invalid');
  // Disabling expansion does not alter root selection; the manifest generator
  // separately captures bounded comments and records omissions.
  const passes = input.passes.map(pass => ({ ...pass, includeComments: false }));
  return (from, to) => {
    const config: SourceRuntimeConfig = { ...original, scanPasses: passes, includeComments: false, maxItems: 100,
      targetPublishedWindow: { startInclusive: from.toISOString(), endExclusive: to.toISOString() } };
    const context = { ...input.context, config };
    return input.provider.scan(input.provider.planScan(query, context), context);
  };
}
