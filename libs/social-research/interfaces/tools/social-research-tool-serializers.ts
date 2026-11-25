import type {
  RankedSocialSearchItem,
  SocialSearchItem,
} from '../../domain/entities/social-search-item';
import type {
  SocialSearchRun,
  SocialThread,
} from '../../application/contracts/social-research-gateway';
import type { SocialSearchLane, SocialSearchPlan } from '../../domain/value-objects/social-search-plan';

export type SerializedSocialSearchItem = Omit<SocialSearchItem, 'publishedAt'> & {
  readonly publishedAt?: string;
};

export type SerializedRankedSocialSearchItem = Omit<
  RankedSocialSearchItem,
  'item'
> & {
  readonly item: SerializedSocialSearchItem;
};

export type SerializedSocialSearchPlan = Omit<SocialSearchPlan, 'lanes'> & {
  readonly lanes: readonly SocialSearchLane[];
};

export type SerializedSocialSearchRun = Omit<
  SocialSearchRun,
  'items' | 'rankedItems'
> & {
  readonly items: readonly SerializedSocialSearchItem[];
  readonly rankedItems?: readonly SerializedRankedSocialSearchItem[];
};

export type SerializedSocialThread = Omit<SocialThread, 'root' | 'units'> & {
  readonly root: SerializedSocialSearchItem;
  readonly units: readonly {
    readonly unitId: string;
    readonly parentUnitId?: string;
    readonly authorHandle?: string;
    readonly body: string;
    readonly publishedAt?: string;
  }[];
};

export const serializeSearchRun = (
  run: SocialSearchRun,
): SerializedSocialSearchRun => ({
  ...run,
  items: run.items.map(serializeItem),
  rankedItems: run.rankedItems?.map(serializeRankedItem),
});

export const serializeRankedItems = (
  items: readonly RankedSocialSearchItem[],
): readonly SerializedRankedSocialSearchItem[] => items.map(serializeRankedItem);

export const serializeThread = (thread: SocialThread): SerializedSocialThread => ({
  ...thread,
  root: serializeItem(thread.root),
  units: thread.units.map((unit) => ({
    ...unit,
    publishedAt: unit.publishedAt?.toISOString(),
  })),
});

export const serializePlan = (
  plan: SocialSearchPlan,
): SerializedSocialSearchPlan => ({
  ...plan,
  lanes: plan.lanes,
});

const serializeRankedItem = (
  ranked: RankedSocialSearchItem,
): SerializedRankedSocialSearchItem => ({
  ...ranked,
  item: serializeItem(ranked.item),
});

const serializeItem = (item: SocialSearchItem): SerializedSocialSearchItem => ({
  ...item,
  publishedAt: item.publishedAt?.toISOString(),
});
