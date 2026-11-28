/** Narrow SQL capability: EVENT claiming is one atomic statement, not a read/write race. */
export interface PrismaEventOutboxClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}
