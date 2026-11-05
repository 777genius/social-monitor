import { Interest } from "@social-monitor/monitoring/domain";
import { InMemoryInterestRepository } from "@social-monitor/monitoring/adapters/persistence/in-memory-interest.repository";
import { PrismaInterestRepository } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-interest.repository";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { MonitoringConfiguredInterestReader } from "./monitoring-configured-interest.reader";

const scope = { tenantId: tenantId("fixture-tenant"), workspaceId: workspaceId("fixture-workspace"), interestId: "fixture-interest" };
const interest = Interest.create({ ...scope, id: scope.interestId, name: "Configured interest",
  query: "best", createdAt: new Date("2026-09-08T00:00:00Z") });

describe("Monitoring configured interest read integration", () => {
  it("reads current configured query and respects archive and each scope dimension", async () => {
    const repository = new InMemoryInterestRepository();
    await repository.save(interest);
    const reader = new MonitoringConfiguredInterestReader(repository);
    expect(await reader.readCurrent(scope)).toEqual({ kind: "available", interest: { ...scope, query: "best" } });
    for (const change of [{ tenantId: tenantId("other") }, { workspaceId: workspaceId("other") }, { interestId: "other" }]) {
      expect(await reader.readCurrent({ ...scope, ...change })).toEqual({ kind: "missing" });
    }
    await repository.save(interest.updateDetails({ name: "Updated", query: "bread recipes" }));
    expect(await reader.readCurrent(scope)).toMatchObject({ interest: { query: "bread recipes" } });
    await repository.archive({ ...scope, archivedAt: new Date("2026-09-08T01:00:00Z") });
    expect(await reader.readCurrent(scope)).toEqual({ kind: "missing" });
  });

  it("uses the durable repository's scoped, nondeleted read without leaking records", async () => {
    const findFirst = jest.fn().mockResolvedValue({ ...interest.toSnapshot(), deletedAt: null, status: "ENABLED" });
    const reader = new MonitoringConfiguredInterestReader(new PrismaInterestRepository({
      interest: { findFirst },
    } as unknown as ConstructorParameters<typeof PrismaInterestRepository>[0]));
    expect(await reader.readCurrent(scope)).toEqual({ kind: "available", interest: { ...scope, query: "best" } });
    expect(findFirst).toHaveBeenCalledWith({ where: { tenantId: scope.tenantId,
      workspaceId: scope.workspaceId, id: scope.interestId, deletedAt: null } });
    findFirst.mockResolvedValueOnce(null);
    expect(await reader.readCurrent(scope)).toEqual({ kind: "missing" });
  });

  it("fails closed for repository failure and wrongly scoped records", async () => {
    const failure = new MonitoringConfiguredInterestReader({ findById: async () => { throw new Error("database unavailable"); } });
    expect(await failure.readCurrent(scope)).toEqual({ kind: "unavailable" });
    const mismatched = new MonitoringConfiguredInterestReader({ findById: async () => interest });
    expect(await mismatched.readCurrent({ ...scope, workspaceId: workspaceId("other") })).toEqual({ kind: "unavailable" });
  });
});
