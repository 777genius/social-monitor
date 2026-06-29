import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Interest, type InterestProps } from '../../domain';
import type { ArchiveInterestParams, ListInterestsQuery, ListInterestsResult, InterestRepositoryPort } from '../../ports';
import { ArchiveInterestUseCase } from './archive-interest.use-case';

describe('ArchiveInterestUseCase', () => {
  it('archives an interest and returns an archived view', async () => {
    const interests = new FakeInterestRepository();
    await interests.save(makeInterest({ id: 'interest-1' }));

    const result = await new ArchiveInterestUseCase(
      interests,
      new FixedClock(new Date('2026-06-07T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'interest-1',
        status: 'archived',
      }),
    });
    expect(interests.archivedAt?.toISOString()).toBe('2026-06-07T00:00:00.000Z');
  });

  it('fails closed when the interest is missing', async () => {
    const result = await new ArchiveInterestUseCase(
      new FakeInterestRepository(),
      new FixedClock(new Date('2026-06-07T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'missing-interest',
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    }));
  });
});

const makeInterest = (overrides: Partial<InterestProps> = {}): Interest => Interest.create({
  id: 'interest-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  name: 'AI Infrastructure',
  query: 'AI infrastructure',
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  ...overrides,
});

class FakeInterestRepository implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();
  archivedAt: Date | null = null;

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();

    this.interests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, interest);
  }

  async archive(params: ArchiveInterestParams): Promise<void> {
    this.archivedAt = params.archivedAt;
    this.interests.delete(`${params.tenantId}:${params.workspaceId}:${params.interestId}`);
  }

  async findByName(params: Parameters<InterestRepositoryPort['findByName']>[0]): Promise<Interest | null> {
    const normalizedName = params.name.trim().toLowerCase();

    return [...this.interests.values()].find((interest) => {
      const snapshot = interest.toSnapshot();

      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === normalizedName
      );
    }) ?? null;
  }

  async findById(params: Parameters<InterestRepositoryPort['findById']>[0]): Promise<Interest | null> {
    return this.interests.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    return {
      interests: [...this.interests.values()].filter((interest) => {
        const snapshot = interest.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}
