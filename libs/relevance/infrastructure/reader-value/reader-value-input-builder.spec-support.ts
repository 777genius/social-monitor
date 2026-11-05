import { SourceContentSafetyPolicy } from '../../domain/source-content-safety';
import type { ReaderValueSource } from '../../domain/reader-value/reader-value-source';
import { ConservativeReaderValueInputBuilder } from './reader-value-input-builder';
import type { ReaderValueScoringProvider } from './reader-value-provider-config';

export const fixtureSource: ReaderValueSource = {
  tenantId: 'tenant', workspaceId: 'workspace', interestId: 'interest', sourceItemId: 'source',
  providerKey: 'rss', canonicalUrl: 'https://example.test/article', title: 'A measured method',
  body: '  No improvement.\nMeasured 12 cases.  ', interest: 'Testing methods', availableAt: null,
  capture: { representationVersion: 'fixture.v1', availability: 'complete', segments: [] },
};
export function preparedInput(patch: Partial<ReaderValueSource> = {}, provider: ReaderValueScoringProvider = 'openrouter-systemone') {
  const result = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), provider).prepare({ ...fixtureSource, ...patch }, 'revision');
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
