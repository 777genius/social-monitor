import {
  closeReaderSummaryFixtureResources,
  createReaderSummaryFixtureLifecycle,
} from
  "./reader-summary-fixture-resource-lifecycle";

describe("reader summary fixture resource lifecycle", () => {
  it("closes every acquired resource in order when one close fails", async () => {
    const closed: string[] = [];

    await expect(closeReaderSummaryFixtureResources([
      { name: "http", close: async () => { closed.push("http"); } },
      { name: "socket", close: async () => {
        closed.push("socket");
        throw new Error("socket close failed");
      } },
      { name: "database", close: async () => { closed.push("database"); } },
    ])).rejects.toThrow("fixture resource cleanup failed");

    expect(closed).toEqual(["http", "socket", "database"]);
  });

  it("resolves when no partial resources were acquired", async () => {
    await expect(closeReaderSummaryFixtureResources([])).resolves.toBeUndefined();
  });

  it("closes only acquired fixture resources in safe reverse order", async () => {
    const closed: string[] = [];
    const lifecycle = createLifecycle({
      testingModule: { close: async () => { closed.push("module"); } },
      database: { close: async () => { closed.push("database"); } },
    });

    await lifecycle.close();

    expect(closed).toEqual(["module", "database"]);
  });

  it("shares concurrent and repeated close completion exactly once", async () => {
    let releaseClose = (): void => {
      throw new Error("Close release was not initialized");
    };
    let closeCount = 0;
    const lifecycle = createLifecycle({
      application: { close: () => {
        closeCount += 1;
        return new Promise<void>((resolve) => {
          releaseClose = () => { resolve(); };
        });
      } },
    });

    const first = lifecycle.close();
    const concurrent = lifecycle.close();
    expect(concurrent).toBe(first);
    expect(closeCount).toBe(1);
    releaseClose();
    await first;

    expect(lifecycle.close()).toBe(first);
    await lifecycle.close();
    expect(closeCount).toBe(1);
  });

  it("attempts remaining cleanup and reports close failures deterministically", async () => {
    const closed: string[] = [];
    const lifecycle = createLifecycle({
      application: { close: async () => {
        closed.push("application");
        throw new Error("application close failed");
      } },
      databaseServer: { stop: async () => { closed.push("server"); } },
      database: { close: async () => {
        closed.push("database");
        throw new Error("database close failed");
      } },
    });

    const error = await lifecycle.close().catch((failure: unknown) => failure);

    expect(closed).toEqual(["application", "server", "database"]);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map(
      (failure: Error) => failure.message,
    )).toEqual([
      "Failed to close Nest application",
      "Failed to close PGlite database",
    ]);
  });

  it("bounds startup cleanup and exits with code one", async () => {
    const reports: string[] = [];
    const exitCodes: number[] = [];
    const lifecycle = createLifecycle({
      application: { close: () => new Promise<void>(() => undefined) },
    }, {
      resourceCloseTimeoutMs: 5,
      report: (message) => { reports.push(message); },
      exit: (code) => { exitCodes.push(code); },
    });

    await lifecycle.handleStartupFailure();

    expect(reports).toEqual([
      "Reader summary fixture startup failed\n",
      "Reader summary fixture cleanup failed\n",
    ]);
    expect(exitCodes).toEqual([1]);
  });
});

interface FixtureResources {
  readonly application?: { close(): Promise<void> };
  readonly testingModule?: { close(): Promise<void> };
  readonly databaseServer?: { stop(): Promise<void> };
  readonly database?: { close(): Promise<void> };
}

const createLifecycle = (
  resources: FixtureResources,
  overrides: Partial<{
    resourceCloseTimeoutMs: number;
    report: (message: string) => void;
    exit: (code: number) => void;
  }> = {},
) => createReaderSummaryFixtureLifecycle({
  application: () => resources.application,
  testingModule: () => resources.testingModule,
  databaseServer: () => resources.databaseServer,
  database: () => resources.database,
  resourceCloseTimeoutMs: overrides.resourceCloseTimeoutMs ?? 1_000,
  report: overrides.report ?? (() => undefined),
  exit: overrides.exit ?? (() => undefined),
});
