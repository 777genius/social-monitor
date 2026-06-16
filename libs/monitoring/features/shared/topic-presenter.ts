import type { Topic, TopicProps } from '../../domain';

export type TopicView = Omit<TopicProps, 'createdAt'> & {
  readonly createdAt: string;
};

export const presentTopic = (topic: Topic): TopicView => {
  const snapshot = topic.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
  };
};
