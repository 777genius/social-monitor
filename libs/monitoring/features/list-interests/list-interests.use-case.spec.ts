import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Interest, type InterestProps } from '../../domain';
import type { ListInterestsQuery, ListInterestsResult, InterestRepositoryPort } from '../../ports';
import { ListInterestsUseCase } from './list-interests.use-case';

describe('ListInterestsUseCase', () => {
  it('lists tenant-scoped interests in newest-first pages', async () => {
    const interests = new FakeInterestRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await interests.save(makeInterest({
      id: 'interest-old',
      tenantId: tenant,
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    await interests.save(makeInterest({
      id: 'interest-new',
      tenantId: tenant,
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T01:00:00.000Z'),
    }));
    await interests.save(makeInterest({
      id: 'interest-other-tenant',
      tenantId: tenantId('tenant-2'),
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T02:00:00.000Z'),
    }));

    const firstPage = await new ListInterestsUseCase(interests).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
    });

    expect(firstPage).toEqual({
      ok: true,
      value: {
        interests: [
          expect.objectContaining({
            id: 'interest-new',
            tenantId: tenant,
            workspaceId: workspace,
            createdAt: '2026-06-06T01:00:00.000Z',
          }),
        ],
        nextCursor: expect.any(String),
      },
    });

    if (!firstPage.ok) {
      throw firstPage.error;
    }

    const secondPage = await new ListInterestsUseCase(interests).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
      cursor: firstPage.value.nextCursor,
    });

    expect(secondPage).toEqual({
      ok: true,
      value: {
        interests: [
          expect.objectContaining({
            id: 'interest-old',
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects unsafe limits', async () => {
    await expect(new ListInterestsUseCase(new FakeInterestRepository()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 0,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
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
    const offset = parseCursor(query.cursor);
    const allInterests = [...this.interests.values()]
      .filter((interest) => {
        const snapshot = interest.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareInterestsByCreation);
    const interests = allInterests.slice(offset, offset + query.limit);
    const nextOffset = offset + interests.length;

    return {
      interests,
      nextCursor: nextOffset < allInterests.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareInterestsByCreation = (left: Interest, right: Interest): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

  return typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) ? parsed.offset : 0;
};
