import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Topic, type TopicProps } from '../../domain';
import type { ListTopicsQuery, ListTopicsResult, TopicRepositoryPort } from '../../ports';
import { ListTopicsUseCase } from './list-topics.use-case';

describe('ListTopicsUseCase', () => {
  it('lists tenant-scoped topics in newest-first pages', async () => {
    const topics = new FakeTopicRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await topics.save(makeTopic({
      id: 'topic-old',
      tenantId: tenant,
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    await topics.save(makeTopic({
      id: 'topic-new',
      tenantId: tenant,
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T01:00:00.000Z'),
    }));
    await topics.save(makeTopic({
      id: 'topic-other-tenant',
      tenantId: tenantId('tenant-2'),
      workspaceId: workspace,
      createdAt: new Date('2026-06-06T02:00:00.000Z'),
    }));

    const firstPage = await new ListTopicsUseCase(topics).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
    });

    expect(firstPage).toEqual({
      ok: true,
      value: {
        topics: [
          expect.objectContaining({
            id: 'topic-new',
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

    const secondPage = await new ListTopicsUseCase(topics).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
      cursor: firstPage.value.nextCursor,
    });

    expect(secondPage).toEqual({
      ok: true,
      value: {
        topics: [
          expect.objectContaining({
            id: 'topic-old',
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects unsafe limits', async () => {
    await expect(new ListTopicsUseCase(new FakeTopicRepository()).execute({
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

const makeTopic = (overrides: Partial<TopicProps> = {}): Topic => Topic.create({
  id: 'topic-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  name: 'AI Infrastructure',
  query: 'AI infrastructure',
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  ...overrides,
});

class FakeTopicRepository implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();

    this.topics.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, topic);
  }

  async findByName(params: Parameters<TopicRepositoryPort['findByName']>[0]): Promise<Topic | null> {
    const normalizedName = params.name.trim().toLowerCase();

    return [...this.topics.values()].find((topic) => {
      const snapshot = topic.toSnapshot();

      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === normalizedName
      );
    }) ?? null;
  }

  async findById(params: Parameters<TopicRepositoryPort['findById']>[0]): Promise<Topic | null> {
    return this.topics.get(`${params.tenantId}:${params.workspaceId}:${params.topicId}`) ?? null;
  }

  async list(query: ListTopicsQuery): Promise<ListTopicsResult> {
    const offset = parseCursor(query.cursor);
    const allTopics = [...this.topics.values()]
      .filter((topic) => {
        const snapshot = topic.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareTopicsByCreation);
    const topics = allTopics.slice(offset, offset + query.limit);
    const nextOffset = offset + topics.length;

    return {
      topics,
      nextCursor: nextOffset < allTopics.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareTopicsByCreation = (left: Topic, right: Topic): number => {
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
