const mockPoolFactory = jest.fn();
const mockPrismaFactory = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn((options: unknown) => mockPoolFactory(options)) }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('../../prisma/generated/client/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaFactory()),
}));
jest.mock('@social-monitor/platform-persistence', () => ({
  withPrismaWriteRetry: (work: () => Promise<unknown>) => work(),
}));
jest.mock('./local-config', () => ({ readPublicDefaults: async () => ({}) }));

const pool = () => ({
  query: jest.fn(async () => ({ rowCount: 1, rows: [{ safe: true, owner: 'social_monitor_app' }] })),
  connect: jest.fn(), end: jest.fn(async () => undefined),
});
const fail = async (): Promise<never> => { throw new Error('synthetic database failure'); };

describe('finite installer database resources', () => {
  const previousEnvironment = process.env;
  const previousExitCode = process.exitCode;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...previousEnvironment, DATABASE_URL: 'postgresql://postgres:5432/social_monitor',
      SELFHOST_MIGRATOR_PASSWORD: '0'.repeat(48), SELFHOST_APPLICATION_PASSWORD: '0'.repeat(48),
      SELFHOST_SYSTEM_PASSWORD: '0'.repeat(48),
    };
    const url = new URL(process.env.DATABASE_URL!);
    url.username = 'social_monitor';
    process.env.DATABASE_URL = url.toString();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = previousEnvironment;
    process.exitCode = previousExitCode;
    jest.restoreAllMocks();
  });
  const run = async (script: 'migrate' | 'seed-workspace') => {
    await jest.isolateModulesAsync(async () => {
      if (script === 'migrate') await import('./migrate');
      else await import('./seed-workspace');
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(process.exitCode).toBe(1);
    for (const [options] of mockPoolFactory.mock.calls) expect(options).toMatchObject({ min: 0, max: 1 });
  };

  it.each(['constructor', 'transaction', 'disconnect'])('ends the seed pool after %s failure', async (phase) => {
    const database = pool();
    const prisma = { $transaction: jest.fn(async () => undefined), $disconnect: jest.fn(async () => undefined) };
    mockPoolFactory.mockReturnValue(database);
    mockPrismaFactory.mockImplementation(() => prisma);
    if (phase === 'constructor') mockPrismaFactory.mockImplementation(() => { throw new Error('synthetic constructor failure'); });
    if (phase === 'transaction') prisma.$transaction.mockImplementation(fail);
    if (phase === 'disconnect') prisma.$disconnect.mockImplementation(fail);
    await run('seed-workspace');
    expect(database.end).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(phase === 'constructor' ? 0 : 1);
  });

  it('ends the provisioner pool after query failure', async () => {
    const database = pool();
    database.query.mockImplementation(fail);
    mockPoolFactory.mockReturnValue(database);
    await run('migrate');
    expect(database.end).toHaveBeenCalledTimes(1);
  });

  it.each(['connect', 'query'])('ends the migration pool after %s failure', async (phase) => {
    const provisioner = pool();
    const migrator = pool();
    const client = { query: jest.fn(fail), release: jest.fn() };
    migrator.connect.mockImplementation(phase === 'connect' ? fail : async () => client);
    mockPoolFactory.mockReturnValueOnce(provisioner).mockReturnValueOnce(migrator);
    await run('migrate');
    expect(provisioner.end).toHaveBeenCalledTimes(1);
    expect(migrator.end).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(phase === 'query' ? 1 : 0);
  });
});
