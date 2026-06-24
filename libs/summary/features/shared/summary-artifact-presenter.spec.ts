import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryArtifact } from '../../domain';
import { presentSummaryArtifact } from './summary-artifact-presenter';

describe('presentSummaryArtifact', () => {
  it('adds UI-ready citation labels while preserving source identifiers', () => {
    const artifact = SummaryArtifact.create({
      schemaVersion: 'summary.artifact.v1',
      summaryId: 'summary-1',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      sourceWindow: {
        windowId: 'window-1',
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:01:00.000Z'),
        selectedFeedItemIds: ['feed-1'],
      },
      headline: 'Summary headline',
      executiveSummary: 'Summary text with evidence.',
      keyPoints: [{ claim: 'A cited claim.', citationIds: ['citation-1'] }],
      risksAndUnknowns: [],
      sourceHighlights: ['feed-1'],
      citationMap: [
        {
          citationId: 'citation-1',
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          providerKey: 'rss',
          field: 'title',
          canonicalUrl: 'https://example.test/source-1',
        },
      ],
      qualityFlags: ['limited_sources'],
      confidence: {
        level: 'low',
        score: 0.35,
        rationale: 'Limited source count.',
      },
      lineage: {
        promptVersion: 'prompt-v1',
        schemaVersion: 'summary.artifact.v1',
        modelVersion: 'model-v1',
        providerVersion: 'provider-v1',
        rulesVersion: 'rules-v1',
        evalDatasetVersion: 'eval-v1',
      },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        estimatedCostUsd: 0,
      },
    });

    expect(presentSummaryArtifact(artifact, {
      status: 'stale',
      checkedAt: new Date('2026-06-06T00:05:00.000Z'),
      staleMarkedAt: new Date('2026-06-06T00:05:00.000Z'),
      reason: 'new_evidence_after_window',
      newestFeedItemId: 'feed-2',
      newestObservedAt: new Date('2026-06-06T00:04:00.000Z'),
    })).toMatchObject({
      sourceWindow: {
        startedAt: '2026-06-06T00:00:00.000Z',
        endedAt: '2026-06-06T00:01:00.000Z',
      },
      freshness: {
        status: 'stale',
        checkedAt: '2026-06-06T00:05:00.000Z',
        staleMarkedAt: '2026-06-06T00:05:00.000Z',
        reason: 'new_evidence_after_window',
        newestFeedItemId: 'feed-2',
        newestObservedAt: '2026-06-06T00:04:00.000Z',
      },
      citations: [
        {
          citationId: 'citation-1',
          label: '[1]',
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          providerKey: 'rss',
          field: 'title',
          canonicalUrl: 'https://example.test/source-1',
        },
      ],
    });
  });
});
