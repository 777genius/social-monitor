import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { IsolatedScanCursorRepository } from "./isolated-scan-cursor.repository";

const scope = () => ({
  tenantId: tenantId("tenant-a"),
  workspaceId: workspaceId("workspace-a"),
  sourceBindingId: "binding-a",
});

describe("IsolatedScanCursorRepository", () => {
  it("starts without a checkpoint and keeps saves within one run", async () => {
    const cursor = new IsolatedScanCursorRepository(scope());
    expect(await cursor.findBySourceBinding(scope())).toBeNull();
    await cursor.save({ ...scope(), cursor: "etag-a", committedAt: new Date("2026-09-01T00:00:00Z") });
    expect((await cursor.findBySourceBinding(scope()))?.cursor).toBe("etag-a");
    expect(await new IsolatedScanCursorRepository(scope()).findBySourceBinding(scope())).toBeNull();
  });

  it.each([
    { tenantId: tenantId("tenant-b") },
    { workspaceId: workspaceId("workspace-b") },
    { sourceBindingId: "binding-b" },
  ])("rejects reads and writes outside its scope: %p", async (change) => {
    const cursor = new IsolatedScanCursorRepository(scope());
    const other = { ...scope(), ...change };
    await expect(cursor.findBySourceBinding(other)).rejects.toThrow("scope mismatch");
    await expect(cursor.save({ ...other, cursor: "x", committedAt: new Date() })).rejects.toThrow("scope mismatch");
  });

  it.each([
    { tenantId: "" as ReturnType<typeof tenantId> },
    { workspaceId: " " as ReturnType<typeof workspaceId> },
    { sourceBindingId: "" },
    { sourceBindingId: " binding-a " },
  ])("rejects an invalid constructor scope: %p", (change) => {
    expect(() => new IsolatedScanCursorRepository({ ...scope(), ...change })).toThrow("valid scope");
  });

  it("copies the scope, saved date, and returned date", async () => {
    const originalScope = scope();
    const cursor = new IsolatedScanCursorRepository(originalScope);
    const committedAt = new Date("2026-09-01T00:00:00Z");
    await cursor.save({ ...scope(), cursor: "etag-a", committedAt });
    originalScope.sourceBindingId = "binding-b";
    committedAt.setUTCFullYear(2030);
    const first = await cursor.findBySourceBinding(scope());
    expect(first?.committedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    first?.committedAt.setUTCFullYear(2040);
    expect((await cursor.findBySourceBinding(scope()))?.committedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
