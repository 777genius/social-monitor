import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Digest, type DigestProps } from '../../domain';
import type { DigestRepositoryPort } from '../../ports';
import { GetDigestUseCase } from './get-digest.use-case';

class FakeDigests implements DigestRepositoryPort {
  private readonly digests = new Map<string, Digest>();

  async save(digest: Digest): Promise<void> {
    const snapshot = digest.toSnapshot();
    this.digests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, digest);
  }

  async findById(params: Parameters<DigestRepositoryPort['findById']>[0]): Promise<Digest | null> {
    return this.digests.get(`${params.tenantId}:${params.workspaceId}:${params.digestId}`) ?? null;
  }

  async findByWindow(): Promise<Digest | null> {
    return null;
  }
}

describe('GetDigestUseCase', () => {
  it('returns a digest with serializable window timestamps and provenance', async () => {
    const digests = new FakeDigests();
    await digests.save(makeDigest({ id: 'digest-1' }));

    const result = await new GetDigestUseCase(digests).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      digestId: 'digest-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'digest-1',
        status: 'assembled',
        window: {
          windowId: 'window-1',
          startedAt: '2026-06-06T00:00:00.000Z',
          endedAt: '2026-06-06T01:00:00.000Z',
        },
        provenance: [
          {
            resourceType: 'summary',
            resourceId: 'summary-1',
            interestId: 'interest-1',
            includedReason: 'within_window',
          },
        ],
      }),
    });
  });

  it('does not return digests from another workspace', async () => {
    const digests = new FakeDigests();
    await digests.save(makeDigest({ id: 'digest-1', workspaceId: workspaceId('workspace-2') }));

    await expect(new GetDigestUseCase(digests).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      digestId: 'digest-1',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });

  it('rejects blank digest ids before repository lookup', async () => {
    await expect(new GetDigestUseCase(new FakeDigests()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      digestId: '',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const makeDigest = (overrides: Partial<DigestProps> = {}): Digest => Digest.assemble({
  id: 'digest-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  recipientKey: 'webhook-1',
  channel: 'webhook',
  window: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-06T00:00:00.000Z'),
    endedAt: new Date('2026-06-06T01:00:00.000Z'),
  },
  status: 'assembled',
  summaryIds: ['summary-1'],
  feedItemIds: ['feed-1'],
  provenance: [
    {
      resourceType: 'summary',
      resourceId: 'summary-1',
      interestId: 'interest-1',
      includedReason: 'within_window',
    },
  ],
  contentHash: 'digest-content-hash',
  assembledAt: new Date('2026-06-06T01:00:01.000Z'),
  ...overrides,
});
