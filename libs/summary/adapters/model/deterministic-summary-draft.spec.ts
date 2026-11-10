import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { defaultSummaryGenerationPolicy } from '../../domain';
import type { SummaryModelInput, SummaryModelRoute } from '../../ports';
import { buildDeterministicSummaryAttempt } from './deterministic-summary-draft';
import { DeterministicSummaryModelAdapter } from './deterministic-summary-model.adapter';

const requestedAt = new Date('2026-06-06T00:00:00.000Z');
const route: SummaryModelRoute = {
  provider: 'deterministic-local',
  model: 'summary-fake-v1',
  promptVersion: 'summary.prompt.v1',
  schemaVersion: 'summary.artifact.v1',
};

const inputWithItems = (count: number): SummaryModelInput => ({
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  interestId: 'fixture-interest',
  requestedAt,
  policy: defaultSummaryGenerationPolicy(),
  evidence: {
    sourceWindow: {
      windowId: 'fixture-window',
      startedAt: requestedAt,
      endedAt: requestedAt,
      selectedFeedItemIds: Array.from({ length: count }, (_, i) => `feed-${i + 1}`),
    },
    items: Array.from({ length: count }, (_, i) => ({
      feedItemId: `feed-${i + 1}`,
      sourceItemId: `source-${i + 1}`,
      sourceBindingId: `binding-${i + 1}`,
      providerKey: i % 2 === 0 ? 'github' : 'reddit',
      title: `Synthetic evidence ${i + 1}`,
      canonicalUrl: `https://example.test/${i + 1}`,
      observedAt: requestedAt,
    })),
  },
});

describe('Deterministic summary draft projection', () => {
  const adapter = new DeterministicSummaryModelAdapter();

  it('preserves no-signal copy, empty citations, confidence and lineage', async () => {
    const input = inputWithItems(0);
    const usage = adapter.estimate(input, route);
    const projected = buildDeterministicSummaryAttempt(input, route, usage);
    expect(projected).toEqual(await adapter.summarize(input, route));
    expect(projected.draft).toMatchObject({
      headline: 'No reliable signal yet',
      keyPoints: [],
      citationMap: [],
      qualityFlags: ['no_signal', 'limited_sources'],
      confidence: { level: 'none', score: 0 },
      noSignalReason: 'No eligible evidence items selected for this interest.',
      lineage: {
        promptVersion: 'summary.prompt.v1',
        schemaVersion: 'summary.artifact.v1',
        modelVersion: 'summary-fake-v1',
        providerVersion: 'deterministic-local',
        rulesVersion: input.policy.rulesVersion,
        evalDatasetVersion: 'summary.eval.mvp.v1',
      },
      usage,
    });
  });

  it('binds generated citations exclusively to selected source IDs', async () => {
    const input = {
      ...inputWithItems(3),
      policy: {
        ...defaultSummaryGenerationPolicy(),
        maxKeyPoints: 2,
      },
    };
    const usage = adapter.estimate(input, route);
    const projected = buildDeterministicSummaryAttempt(input, route, usage);
    expect(projected).toEqual(await adapter.summarize(input, route));
    expect(projected.draft.citationMap).toEqual([
      {
        citationId: 'c1',
        feedItemId: 'feed-1',
        sourceItemId: 'source-1',
        providerKey: 'github',
        field: 'title',
        canonicalUrl: 'https://example.test/1',
      },
      {
        citationId: 'c2',
        feedItemId: 'feed-2',
        sourceItemId: 'source-2',
        providerKey: 'reddit',
        field: 'title',
        canonicalUrl: 'https://example.test/2',
      },
    ]);
    expect(projected.draft.keyPoints).toEqual([
      { claim: 'Synthetic evidence 1', citationIds: ['c1'] },
      { claim: 'Synthetic evidence 2', citationIds: ['c2'] },
    ]);
    expect(projected.draft.confidence).toMatchObject({ level: 'medium', score: 0.6 });
    expect(projected.draft.qualityFlags).toEqual([]);
  });

  it('respects disabled optional risks and highlights while retaining a grounded citation map', async () => {
    const input = {
      ...inputWithItems(1),
      policy: {
        ...defaultSummaryGenerationPolicy(),
        includeRisks: false,
        includeSourceHighlights: false,
      },
    };
    const usage = adapter.estimate(input, route);
    const projected = buildDeterministicSummaryAttempt(input, route, usage);
    expect(projected).toEqual(await adapter.summarize(input, route));
    expect(projected.draft.risksAndUnknowns).toEqual([]);
    expect(projected.draft.sourceHighlights).toEqual([]);
    expect(projected.draft.citationMap).toHaveLength(1);
    expect(projected.draft.qualityFlags).toEqual(['limited_sources']);
    expect(projected.draft.confidence).toMatchObject({ level: 'low', score: 0.35 });
  });
});
