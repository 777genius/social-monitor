import type { TopicView } from '../../features/shared/topic-presenter';

export type ListTopicsResponseDto = {
  readonly topics: readonly TopicView[];
  readonly nextCursor?: string;
};
