export interface ReaderSummaryFixtureResource {
  readonly name: string;
  readonly close: () => Promise<void>;
}

export const closeReaderSummaryFixtureResources = async (
  resources: readonly ReaderSummaryFixtureResource[],
  resourceCloseTimeoutMs?: number,
): Promise<void> => {
  const failures: Error[] = [];
  for (const resource of resources) {
    try {
      await closeResource(resource, resourceCloseTimeoutMs);
    } catch (error) {
      failures.push(
        new Error(`Failed to close ${resource.name}`, { cause: error }),
      );
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Reader summary fixture resource cleanup failed",
    );
  }
};

interface CloseableFixtureResource {
  close(): Promise<void>;
}

interface StoppableFixtureResource {
  stop(): Promise<void>;
}

export interface ReaderSummaryFixtureLifecycleDependencies {
  readonly application: () => CloseableFixtureResource | undefined;
  readonly testingModule: () => CloseableFixtureResource | undefined;
  readonly databaseServer: () => StoppableFixtureResource | undefined;
  readonly database: () => CloseableFixtureResource | undefined;
  readonly resourceCloseTimeoutMs: number;
  readonly report: (message: string) => void;
  readonly exit: (code: number) => void;
}

export interface ReaderSummaryFixtureLifecycle {
  readonly close: () => Promise<void>;
  readonly handleStartupFailure: () => Promise<void>;
}

export const createReaderSummaryFixtureLifecycle = (
  dependencies: ReaderSummaryFixtureLifecycleDependencies,
): ReaderSummaryFixtureLifecycle => {
  let closePromise: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closePromise ??= closeReaderSummaryFixtureResources(
      acquiredResourcesInCleanupOrder(dependencies),
      dependencies.resourceCloseTimeoutMs,
    );
    return closePromise;
  };

  const handleStartupFailure = async (): Promise<void> => {
    dependencies.report("Reader summary fixture startup failed\n");
    try {
      await close();
    } catch {
      dependencies.report("Reader summary fixture cleanup failed\n");
    }
    dependencies.exit(1);
  };

  return { close, handleStartupFailure };
};

const acquiredResourcesInCleanupOrder = (
  dependencies: ReaderSummaryFixtureLifecycleDependencies,
): readonly ReaderSummaryFixtureResource[] => {
  const application = dependencies.application();
  const testingModule = dependencies.testingModule();
  const databaseServer = dependencies.databaseServer();
  const database = dependencies.database();
  return [
    ...(application !== undefined
      ? [{ name: "Nest application", close: () => application.close() }]
      : testingModule !== undefined
        ? [{ name: "Nest testing module", close: () => testingModule.close() }]
        : []),
    ...(databaseServer === undefined
      ? []
      : [{ name: "PGlite socket server", close: () => databaseServer.stop() }]),
    ...(database === undefined
      ? []
      : [{ name: "PGlite database", close: () => database.close() }]),
  ];
};

const closeResource = async (
  resource: ReaderSummaryFixtureResource,
  timeoutMs: number | undefined,
): Promise<void> => {
  if (timeoutMs === undefined) {
    await resource.close();
    return;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      resource.close(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(
            `Timed out closing ${resource.name} after ${timeoutMs}ms`,
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};
