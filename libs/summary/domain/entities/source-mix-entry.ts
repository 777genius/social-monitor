export type SourceMixEntry = {
  readonly providerKey: string;
  readonly itemCount: number;
  readonly citationCount: number;
  readonly storyClusterCount: number;
  readonly crossSourceClusterCount: number;
  readonly singleSourceOnly: boolean;
  readonly topicIds: readonly string[];
};
