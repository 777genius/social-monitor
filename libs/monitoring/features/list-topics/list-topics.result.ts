import type { TopicView } from '../shared/topic-presenter';

export type ListTopicsResult = {
  readonly topics: readonly TopicView[];
  readonly nextCursor?: string;
};
