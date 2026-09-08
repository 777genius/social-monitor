import { PrismaMonitoringConnection } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-monitoring-connection";
import { currentDatabaseAccess } from "@social-monitor/platform-persistence";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { checkConfiguredInterestReader, requireFreshCheckSelection } from "./check-configured-interest-reader";
import { liveCheckConfiguredInterests } from "./live-multi-provider-summary-interests";

const scope = { tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"), interestId: "fixture-interest" };
const row = { id: scope.interestId, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
  name: "Fixture interest", query: "AI agents", createdAt: new Date("2026-09-08T00:00:00Z"),
  deletedAt: null, status: "ENABLED" };
const databaseUrl = "postgresql://fixture:password@localhost:5432/fixture";

function lease() {
  const findFirst = jest.fn().mockImplementation(async () => {
    expect(currentDatabaseAccess()).toEqual({ kind: "tenant", tenantId: scope.tenantId, workspaceId: scope.workspaceId });
    return row;
  });
  const close = jest.fn().mockResolvedValue(undefined);
  const create = jest.spyOn(PrismaMonitoringConnection, "create").mockResolvedValue({
    interest: { findFirst }, close,
  } as unknown as PrismaMonitoringConnection);
  return { findFirst, close, create };
}

afterEach(() => jest.restoreAllMocks());

describe("fresh check Monitoring lease composition", () => {
  it("lazily acquires bounded independent leases, scopes the real repository and observes edits", async () => {
    const { create, findFirst, close } = lease();
    const reader = checkConfiguredInterestReader(databaseUrl);
    expect(create).not.toHaveBeenCalled();
    expect(await reader.readCurrent(scope)).toEqual({ kind: "available", interest: { ...scope, query: "AI agents" } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ processId: "admin-tool", min: 0, max: 1,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 }));
    expect(findFirst).toHaveBeenCalledWith({ where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      id: scope.interestId, deletedAt: null } });
    findFirst.mockResolvedValueOnce({ ...row, query: "bread recipes" });
    expect(await reader.readCurrent(scope)).toMatchObject({ interest: { query: "bread recipes" } });
    expect(create).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    expect(currentDatabaseAccess()).toBeUndefined();
  });

  it.each([null, { ...row, tenantId: "other" }, { ...row, workspaceId: "other" },
    { ...row, id: "other" }, { ...row, query: " " }])("rejects missing or mismatched authority and closes (%#)", async (record) => {
    const { findFirst, close } = lease();
    findFirst.mockResolvedValueOnce(record);
    expect(await checkConfiguredInterestReader(databaseUrl).readCurrent(scope)).toEqual({ kind: record === null ? "missing" : "unavailable" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes after query failure and rejects cleanup failure", async () => {
    const { findFirst, close } = lease();
    findFirst.mockRejectedValueOnce(new Error("fixture query failed"));
    const reader = checkConfiguredInterestReader(databaseUrl);
    expect(await reader.readCurrent(scope)).toEqual({ kind: "unavailable" });
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRejectedValueOnce(new Error("fixture close failed"));
    await expect(reader.readCurrent(scope)).rejects.toThrow("fixture close failed");
  });

  it("fails closed when acquisition fails without manufacturing a lease to close", async () => {
    const { create, findFirst, close } = lease();
    create.mockRejectedValueOnce(new Error("fixture acquisition failed"));
    expect(await checkConfiguredInterestReader(databaseUrl).readCurrent(scope)).toEqual({ kind: "unavailable" });
    expect(findFirst).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("releases an acquired lease on invalid tenant access scope", async () => {
    const { findFirst, close } = lease();
    expect(await checkConfiguredInterestReader(databaseUrl).readCurrent({ ...scope, tenantId: tenantId("invalid") })).toEqual({ kind: "unavailable" });
    expect(findFirst).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("check selection authority", () => {
  it("rejects immutable/legacy replay before any Monitoring connection, including update mode", () => {
    const { create } = lease();
    for (const argv of [[], ["--update"], ["--allow-dirty-collection"]]) {
      expect(() => requireFreshCheckSelection(argv)).toThrow("Immutable replay requires captured");
    }
    expect(() => requireFreshCheckSelection(["--fresh-selection"])).not.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("uses explicit in-memory Monitoring intent and isolates every scope dimension", async () => {
    const { create } = lease();
    const reader = await liveCheckConfiguredInterests({ persistence: { mode: "in-memory" }, scope,
      query: "bread recipes", createdAt: row.createdAt });
    expect(await reader.readCurrent(scope)).toEqual({ kind: "available", interest: { ...scope, query: "bread recipes" } });
    for (const change of [{ tenantId: tenantId("other") }, { workspaceId: workspaceId("other") }, { interestId: "other" }]) {
      expect(await reader.readCurrent({ ...scope, ...change })).toEqual({ kind: "missing" });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("requires independent in-memory intent and never infers it from targets", async () => {
    await expect(liveCheckConfiguredInterests({ persistence: { mode: "in-memory" }, scope,
      query: undefined, createdAt: row.createdAt })).rejects.toThrow("LIVE_MULTI_PROVIDER_INTEREST_QUERY");
  });

  it("durable mode reads persisted Monitoring config even if an in-memory query is supplied", async () => {
    const { close } = lease();
    const reader = await liveCheckConfiguredInterests({ persistence: { mode: "prisma", databaseUrl }, scope,
      query: "ignored in durable mode", createdAt: row.createdAt });
    expect(await reader.readCurrent(scope)).toMatchObject({ interest: { query: "AI agents" } });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
