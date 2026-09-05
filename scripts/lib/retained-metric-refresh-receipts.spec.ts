import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";
import { createRecoveryEvidenceFilesystemTestHarness } from "./reader-summary-recovery-evidence-secure-file";
import { requireMetricRefreshTestDatabase } from "../check-retained-metric-refresh-postgres";

describe("retained refresh permanent evidence boundary", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "metric-refresh-receipts-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it("keeps immutable operation identity across adapter/process recreation", async () => {
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(root);
    await new SecureMetricRefreshReceipts(filesystem).install("operation.json", { id: "operation-1" });
    const resumed = new SecureMetricRefreshReceipts(filesystem);
    expect(await resumed.read("operation.json")).toEqual({ id: "operation-1" });
    await expect(resumed.install("operation.json", { id: "operation-2" })).rejects.toThrow("different bytes");
    await expect(resumed.install("../operation.json", {})).rejects.toThrow();
  });
  it("rejects symlink aliases and corrupt receipts", async () => {
    const receipts = new SecureMetricRefreshReceipts(createRecoveryEvidenceFilesystemTestHarness(root));
    writeFileSync(join(root, "corrupt.json"), '{"digest":"wrong","value":{}}', { mode: 0o400 });
    symlinkSync(join(root, "corrupt.json"), join(root, "alias.json"));
    await expect(receipts.read("corrupt.json")).rejects.toThrow("digest mismatch");
    await expect(receipts.read("alias.json")).rejects.toThrow();
  });
  it.each([undefined, "postgres://fixture@remote.example/metric_refresh_test_fixture", "postgres://fixture@localhost/social_monitor", "postgres://fixture@localhost/metric_refresh_test_fixture?host=remote.example"])("refuses a missing or non-disposable PostgreSQL DSN before a socket", (url) => {
    expect(() => requireMetricRefreshTestDatabase({ NODE_ENV: "test", METRIC_REFRESH_DISPOSABLE: "1", METRIC_REFRESH_TEST_DATABASE_URL: url })).toThrow();
  });
});
