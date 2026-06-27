import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Topic, type TopicProps } from '../../domain';
import type { ListTopicsQuery, ListTopicsResult, TopicRepositoryPort } from '../../ports';
import { UpdateTopicUseCase } from './update-topic.use-case';

describe('UpdateTopicUseCase', () => {
  it('updates topic name and query inside the workspace', async () => {
    const topics = new FakeTopicRepository();
    await topics.save(makeTopic({ id: 'topic-1' }));

    const result = await new UpdateTopicUseCase(topics).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      name: 'AI Agents',
      query: 'agents OR assistants',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'topic-1',
        name: 'AI Agents',
        query: 'agents OR assistants',
        status: 'active',
      }),
    });
  });

  it('rejects duplicate topic names in the same workspace', async () => {
    const topics = new FakeTopicRepository();
    await topics.save(makeTopic({ id: 'topic-1', name: 'AI Monitoring' }));
    await topics.save(makeTopic({ id: 'topic-2', name: 'Pricing' }));

    const result = await new UpdateTopicUseCase(topics).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-2',
      name: 'AI Monitoring',
      query: 'pricing OR plans',
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'operation.conflict' }),
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
    return {
      topics: [...this.topics.values()].filter((topic) => {
        const snapshot = topic.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}
