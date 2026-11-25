export type SourceQueryPlannerAccount = {
  readonly handle: string;
  readonly sourceKey?: string;
  readonly includePosts?: boolean;
  readonly includeMentions?: boolean;
};

export type SourceQueryPlannerCommunity = {
  readonly name: string;
  readonly sourceKey?: string;
  readonly listings?: readonly ('top' | 'hot' | 'new')[];
};

export type SourceQueryPlannerIntent = {
  readonly topic: string;
  readonly sourceKeys: readonly string[];
  readonly products?: readonly string[];
  readonly keywords?: readonly string[];
  readonly handles?: readonly SourceQueryPlannerAccount[];
  readonly communities?: readonly SourceQueryPlannerCommunity[];
  readonly maxLanes?: number;
  readonly maxLanesPerSource?: number;
  readonly maxItemsPerLane?: number;
  readonly includeEnrichment?: boolean;
};

export type SourceQueryPlanLane = {
  readonly laneId: string;
  readonly sourceKey: string;
  readonly kind: string;
  readonly operation: string;
  readonly query: string;
  readonly priority: number;
  readonly maxItems: number;
  readonly reason: string;
  readonly parameters?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
};

export type SourceQueryPlan = {
  readonly plannerId: string;
  readonly intent: SourceQueryPlannerIntent;
  readonly lanes: readonly SourceQueryPlanLane[];
  readonly warnings: readonly string[];
};
