import {
  createPrismaPgRuntimeConnection,
  defaultPostgresRuntimePoolConfig,
} from "@social-monitor/platform-persistence";

import { PrismaFeedConnection } from "./prisma-feed-connection";

jest.mock("@social-monitor/platform-persistence", () => ({
  ...jest.requireActual("@social-monitor/platform-persistence"),
  createPrismaPgRuntimeConnection: jest.fn(),
}));
jest.mock("@social-monitor/platform-persistence/prisma-runtime-client", () => ({
  loadPrismaRuntimeClient: jest.fn(() => class TestRuntimeClient {}),
}));

it("forwards complete aggregate reads through the real Feed connection boundary", async () => {
  const rows = [{ collectedFeedItemCount: 1220 }];
  const queryRaw = jest.fn().mockResolvedValue(rows);
  const close = jest.fn();
  jest.mocked(createPrismaPgRuntimeConnection).mockImplementation(async (
    _config, _client, compose,
  ) => compose({ client: { $queryRawUnsafe: queryRaw }, close } as never));
  const connection = await PrismaFeedConnection.create(
    defaultPostgresRuntimePoolConfig("postgresql://no-network.invalid/test", "api-gateway"),
  );
  expect(await connection.$queryRawUnsafe("SELECT full_scope", "scope", 7)).toBe(rows);
  expect(queryRaw).toHaveBeenCalledWith("SELECT full_scope", "scope", 7);
  const error = new Error("TEST aggregate read failed");
  queryRaw.mockRejectedValueOnce(error);
  await expect(connection.$queryRawUnsafe("SELECT full_scope")).rejects.toBe(error);
  await connection.close();
  expect(close).toHaveBeenCalledTimes(1);
});
