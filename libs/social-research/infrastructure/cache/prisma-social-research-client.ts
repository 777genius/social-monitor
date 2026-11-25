export type PrismaSocialResearchResultCacheClient = {
  $queryRaw<TValue = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<TValue>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<number>;
};
