import { directDatabaseConstructions, readSource } from './postgres-runtime-pool-budget-test-source';

describe('diagnostic caller PostgreSQL guard integration', () => {
  it('keeps the extracted live persistence helper on the bounded admin factory', () => {
    const source = readSource('scripts/lib/live-multi-provider-summary-persistence.ts');
    expect(directDatabaseConstructions(source)).toEqual([]);
    expect(source.match(/PrismaIngestionWorkerConnection\.createForProcess\(/g)).toHaveLength(1);
    expect(source).toContain('await PrismaIngestionWorkerConnection.createForProcess(params.config.databaseUrl, "admin-tool")');
    expect(source).toContain('close: () => connection.close()');
    expect(source.indexOf('await prepareLiveE2eDatabase(params.config)')).toBeLessThan(
      source.indexOf('await PrismaIngestionWorkerConnection.createForProcess('),
    );
    expect(source).toContain('readBooleanEnv("LIVE_MULTI_PROVIDER_E2E_ALLOW_PERSISTENCE", false)');
    expect(source).toContain('rawDatabaseUrl !== undefined');
    expect(source).toContain('schema === undefined');
    expect(source).toContain('!sameDatabaseUrl(rawDatabaseUrl, productionDatabaseUrl)');
    expect(source).toContain('if (!config.migrate)');
    expect(source).toContain('if (result.status !== 0)');
  });

  it('inventories the replay spec dependency without authorizing a real construction', () => {
    const source = readSource('scripts/lib/yesterday-replay-dispatch.spec.ts');
    expect(directDatabaseConstructions(source)).toEqual([]);
    expect(source).toContain('Pool: jest.fn(() => { throw new Error("Unexpected database acquisition"); })');
    expect(source).toContain('expect(Pool).not.toHaveBeenCalled()');
    expect(source).toContain('expect(PrismaFeedConnection.create).not.toHaveBeenCalled()');
  });
});
