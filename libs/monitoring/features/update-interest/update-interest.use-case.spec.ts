import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Interest, type InterestProps } from '../../domain';
import type { ListInterestsQuery, ListInterestsResult, InterestRepositoryPort } from '../../ports';
import { UpdateInterestUseCase } from './update-interest.use-case';

describe('UpdateInterestUseCase', () => {
  it('updates interest name and query inside the workspace', async () => {
    const interests = new FakeInterestRepository();
    await interests.save(makeInterest({ id: 'interest-1' }));

    const result = await new UpdateInterestUseCase(interests).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      name: 'AI Agents',
      query: 'agents OR assistants',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'interest-1',
        name: 'AI Agents',
        query: 'agents OR assistants',
        status: 'active',
      }),
    });
  });

  it('rejects duplicate interest names in the same workspace', async () => {
    const interests = new FakeInterestRepository();
    await interests.save(makeInterest({ id: 'interest-1', name: 'AI Monitoring' }));
    await interests.save(makeInterest({ id: 'interest-2', name: 'Pricing' }));

    const result = await new UpdateInterestUseCase(interests).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-2',
      name: 'AI Monitoring',
      query: 'pricing OR plans',
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'operation.conflict' }),
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

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();

    this.interests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, interest);
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
