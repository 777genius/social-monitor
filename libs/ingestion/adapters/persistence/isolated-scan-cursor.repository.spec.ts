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
    await cursor.save({ ...scope(), cursor: "etag-a", committedAt: new Date("2026-09-01T00:00:00Z") });
    const other = { ...scope(), ...change };
    await expect(cursor.findBySourceBinding(other)).rejects.toThrow("scope mismatch");
    await expect(cursor.save({ ...other, cursor: "x", committedAt: new Date("2026-09-02T00:00:00Z") })).rejects.toThrow("scope mismatch");
    expect((await cursor.findBySourceBinding(scope()))?.cursor).toBe("etag-a");
  });

  it.each([
    { tenantId: "" as ReturnType<typeof tenantId> },
    { workspaceId: " " as ReturnType<typeof workspaceId> },
    { sourceBindingId: "" },
    { sourceBindingId: " binding-a " },
    { tenantId: 17 as unknown as ReturnType<typeof tenantId> },
  ])("rejects an invalid constructor scope: %p", (change) => {
    expect(() => new IsolatedScanCursorRepository({ ...scope(), ...change })).toThrow("valid scope");
  });

  it.each([
    { cursor: 17 as unknown as string },
    { committedAt: new Date("invalid") },
  ])("rejects an invalid save without replacing the checkpoint: %p", async (change) => {
    const cursor = new IsolatedScanCursorRepository(scope());
    await cursor.save({ ...scope(), cursor: "etag-a", committedAt: new Date("2026-09-01T00:00:00Z") });
    const invalid = { ...scope(), cursor: "etag-b", committedAt: new Date("2026-09-02T00:00:00Z"), ...change };
    await expect(cursor.save(invalid)).rejects.toThrow("Invalid isolated scan cursor value");
    expect((await cursor.findBySourceBinding(scope()))?.cursor).toBe("etag-a");
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
    if (first) (first as { cursor: string }).cursor = "changed";
    expect((await cursor.findBySourceBinding(scope()))?.committedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect((await cursor.findBySourceBinding(scope()))?.cursor).toBe("etag-a");
  });
});
