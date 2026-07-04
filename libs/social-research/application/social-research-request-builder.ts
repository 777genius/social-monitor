import type {
  SocialAccountRef,
  SocialCommunityListing,
  SocialCommunityRef,
  SocialSearchDepth,
  SocialSearchGoal,
  SocialSearchIntent,
  SocialSearchWindow,
  SocialSourceKey,
} from '../domain/value-objects/social-search-intent';
import {
  createSocialSearchIntent,
  type SocialResearchRequestInput,
  type SocialResearchRequestPresetId,
} from './social-research-request';

export type SocialResearchAccountOptions = {
  readonly sourceKey?: SocialSourceKey;
  readonly includePosts?: boolean;
  readonly includeMentions?: boolean;
};

export type SocialResearchCommunityOptions = {
  readonly sourceKey?: SocialSourceKey;
  readonly listings?: readonly SocialCommunityListing[];
};

export class SocialResearchRequestBuilder {
  private constructor(private readonly input: SocialResearchRequestInput) {}

  static topic(topic: string): SocialResearchRequestBuilder {
    return new SocialResearchRequestBuilder({ topic });
  }

  static from(input: SocialResearchRequestInput): SocialResearchRequestBuilder {
    return new SocialResearchRequestBuilder(cloneRequestInput(input));
  }

  preset(preset: SocialResearchRequestPresetId): SocialResearchRequestBuilder {
    return this.next({ preset });
  }

  window(window: SocialSearchWindow): SocialResearchRequestBuilder {
    return this.next({ window });
  }

  depth(depth: SocialSearchDepth): SocialResearchRequestBuilder {
    return this.next({ depth });
  }

  goal(goal: SocialSearchGoal): SocialResearchRequestBuilder {
    return this.next({ goal });
  }

  source(source: SocialSourceKey): SocialResearchRequestBuilder {
    return this.sources(source);
  }

  sources(
    ...sources: readonly SocialSourceKey[]
  ): SocialResearchRequestBuilder {
    return this.next({
      sources: appendValues(this.input.sources, sources),
    });
  }

  account(
    handle: string,
    options: SocialResearchAccountOptions = {},
  ): SocialResearchRequestBuilder {
    return this.accounts({ handle, ...options });
  }

  accounts(
    ...accounts: readonly SocialAccountRef[]
  ): SocialResearchRequestBuilder {
    return this.next({
      accounts: appendValues(this.input.accounts, accounts),
    });
  }

  handle(
    handle: string,
    options: SocialResearchAccountOptions = {},
  ): SocialResearchRequestBuilder {
    return this.account(handle, options);
  }

  product(product: string): SocialResearchRequestBuilder {
    return this.products(product);
  }

  products(...products: readonly string[]): SocialResearchRequestBuilder {
    return this.next({
      products: appendValues(this.input.products, products),
    });
  }

  keyword(keyword: string): SocialResearchRequestBuilder {
    return this.keywords(keyword);
  }

  keywords(...keywords: readonly string[]): SocialResearchRequestBuilder {
    return this.next({
      keywords: appendValues(this.input.keywords, keywords),
    });
  }

  community(
    name: string,
    options: SocialResearchCommunityOptions = {},
  ): SocialResearchRequestBuilder {
    return this.communities({ name, ...options });
  }

  communities(
    ...communities: readonly SocialCommunityRef[]
  ): SocialResearchRequestBuilder {
    return this.next({
      communities: appendValues(this.input.communities, communities),
    });
  }

  url(url: string): SocialResearchRequestBuilder {
    return this.urls(url);
  }

  urls(...urls: readonly string[]): SocialResearchRequestBuilder {
    return this.next({
      urls: appendValues(this.input.urls, urls),
    });
  }

  build(): SocialResearchRequestInput {
    return cloneRequestInput(this.input);
  }

  toIntent(): SocialSearchIntent {
    return createSocialSearchIntent(this.input);
  }

  private next(
    patch: Partial<SocialResearchRequestInput>,
  ): SocialResearchRequestBuilder {
    return new SocialResearchRequestBuilder({
      ...this.input,
      ...patch,
    });
  }
}

export const createSocialResearchRequestBuilder = (
  topic: string,
): SocialResearchRequestBuilder => SocialResearchRequestBuilder.topic(topic);

const appendValues = <T>(
  current: T | readonly T[] | undefined,
  values: readonly T[],
): readonly T[] => [...asArray(current), ...values];

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] => {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
};

const cloneRequestInput = (
  input: SocialResearchRequestInput,
): SocialResearchRequestInput => ({
  ...input,
  ...(input.sources === undefined
    ? {}
    : { sources: [...asArray(input.sources)] }),
  ...(input.accounts === undefined
    ? {}
    : { accounts: [...asArray(input.accounts)] }),
  ...(input.handles === undefined
    ? {}
    : { handles: [...asArray(input.handles)] }),
  ...(input.products === undefined
    ? {}
    : { products: [...asArray(input.products)] }),
  ...(input.keywords === undefined
    ? {}
    : { keywords: [...asArray(input.keywords)] }),
  ...(input.communities === undefined
    ? {}
    : { communities: [...asArray(input.communities)] }),
  ...(input.urls === undefined ? {} : { urls: [...asArray(input.urls)] }),
});
