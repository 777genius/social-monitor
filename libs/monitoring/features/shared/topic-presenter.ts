import type { Topic, TopicProps } from '../../domain';

export type TopicView = Omit<TopicProps, 'createdAt'> & {
  readonly createdAt: string;
  readonly status: 'active' | 'archived';
};

export const presentTopic = (topic: Topic): TopicView => {
  const snapshot = topic.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    status: 'active',
  };
};

export const presentArchivedTopic = (topic: Topic): TopicView => ({
  ...presentTopic(topic),
  status: 'archived',
});
