import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryPolicy } from './summary-policy';

const baseProps = {
  id: 'summary-policy-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  topicId: 'topic-1',
  language: 'en',
  format: 'bullet_digest',
  tone: 'concise',
  maxKeyPoints: 4,
  includeRisks: true,
  includeSourceHighlights: false,
  customInstructions: 'Prioritize buying intent.',
  rulesVersion: 'summary.rules.policy.v1',
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  updatedAt: new Date('2026-06-06T00:00:00.000Z'),
} as const;

describe('SummaryPolicy', () => {
  it('normalizes custom instructions and exposes generation policy', () => {
    const policy = SummaryPolicy.create({
      ...baseProps,
      customInstructions: '  Keep it short.  ',
    });

    expect(policy.toGenerationPolicy()).toEqual({
      language: 'en',
      format: 'bullet_digest',
      tone: 'concise',
      maxKeyPoints: 4,
      includeRisks: true,
      includeSourceHighlights: false,
      customInstructions: 'Keep it short.',
      rulesVersion: 'summary.rules.policy.v1',
    });
  });

  it('rejects unsupported formats and unsafe output size', () => {
    expect(() => SummaryPolicy.create({
      ...baseProps,
      format: 'thread' as never,
    })).toThrow('Unsupported summary policy format');

    expect(() => SummaryPolicy.create({
      ...baseProps,
      maxKeyPoints: 0,
    })).toThrow('Summary policy maxKeyPoints must be an integer between 1 and 10');
  });
});
