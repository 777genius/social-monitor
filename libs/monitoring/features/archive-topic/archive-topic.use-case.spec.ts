import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Topic, type TopicProps } from '../../domain';
import type { ArchiveTopicParams, ListTopicsQuery, ListTopicsResult, TopicRepositoryPort } from '../../ports';
import { ArchiveTopicUseCase } from './archive-topic.use-case';

describe('ArchiveTopicUseCase', () => {
  it('archives a topic and returns an archived view', async () => {
    const topics = new FakeTopicRepository();
    await topics.save(makeTopic({ id: 'topic-1' }));

    const result = await new ArchiveTopicUseCase(
      topics,
      new FixedClock(new Date('2026-06-07T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'topic-1',
        status: 'archived',
      }),
    });
    expect(topics.archivedAt?.toISOString()).toBe('2026-06-07T00:00:00.000Z');
  });

  it('fails closed when the topic is missing', async () => {
    const result = await new ArchiveTopicUseCase(
      new FakeTopicRepository(),
      new FixedClock(new Date('2026-06-07T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'missing-topic',
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    }));
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
  archivedAt: Date | null = null;

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();

    this.topics.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, topic);
  }

  async archive(params: ArchiveTopicParams): Promise<void> {
    this.archivedAt = params.archivedAt;
    this.topics.delete(`${params.tenantId}:${params.workspaceId}:${params.topicId}`);
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
    return {
      topics: [...this.topics.values()].filter((topic) => {
        const snapshot = topic.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}
