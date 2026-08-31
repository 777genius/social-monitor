import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentDatabaseAccess } from "@social-monitor/platform-persistence";

import {
  historicalPromotionLockedChildCommand,
  runHistoricalPromotionLockedPreflight,
} from
  "../run-reader-summary-promotion-v2-locked-date";
import {
  assertHistoricalPromotionInputCurrentBeforeMutation,
  historicalPromotionUnderLockDriftReason,
} from "./reader-summary-promotion-v2-input-guard";

const sourcePublication = {
  publicationId: "00000000-0000-4000-8000-000000000301",
  artifactId: "00000000-0000-4000-8000-000000000302",
  reportSha256: "a".repeat(64),
  proofSha256: "b".repeat(64),
};
const scope = {
  tenantId: "00000000-0000-4000-8000-000000000401",
  workspaceId: "00000000-0000-4000-8000-000000000402",
};

describe("historical Promotion V2 under-lock input gate", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "promotion-under-lock-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("preserves the locked child after ts-node consumes its separator", () => {
    expect(historicalPromotionLockedChildCommand(["node", "production.ts"]))
      .toEqual(["node", "production.ts"]);
    expect(historicalPromotionLockedChildCommand([
      "--", "node", "production.ts",
    ])).toEqual(["node", "production.ts"]);
  });

  it("stops dataset drift before the production-day mutation/model seam", async () => {
    const marker = join(directory, "failure.json");
    const productionDay = jest.fn(() => 0);

    await expect(runHistoricalPromotionLockedPreflight({
      revalidate: () => assertHistoricalPromotionInputCurrentBeforeMutation({
        datasetGuard: {
          assertCurrentBeforeMutation: async () => {
            throw new Error("Reader summary dataset changed at before_mutation");
          },
        },
        client: { $queryRaw: jest.fn() as never },
        ...scope,
        date: "2026-08-01",
        sourcePublication,
        failureMarkerPath: marker,
      }),
      runProductionDay: productionDay,
    })).rejects.toThrow(historicalPromotionUnderLockDriftReason);

    expect(productionDay).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({
      schemaVersion: 1,
      format: "reader-summary-promotion-v2-under-lock-failure-v1",
      reason: historicalPromotionUnderLockDriftReason,
    });
  });

  it("stops active-publication proof drift before production-day invocation", async () => {
    const productionDay = jest.fn(() => 0);
    await expect(runHistoricalPromotionLockedPreflight({
      revalidate: () => assertHistoricalPromotionInputCurrentBeforeMutation({
        datasetGuard: { assertCurrentBeforeMutation: async () => undefined },
        client: {
          $queryRaw: jest.fn(async () => [{
            ...sourcePublication,
            proofSha256: "c".repeat(64),
          }]) as never,
        },
        ...scope,
        date: "2026-08-01",
        sourcePublication,
      }),
      runProductionDay: productionDay,
    })).rejects.toThrow(historicalPromotionUnderLockDriftReason);
    expect(productionDay).not.toHaveBeenCalled();
  });

  it("scopes both revalidation reads before the production-day seam", async () => {
    const events: string[] = [];
    const observedAccess: unknown[] = [];
    const productionDay = jest.fn(() => {
      events.push("production-day");
      return 0;
    });
    await expect(runHistoricalPromotionLockedPreflight({
      revalidate: () => assertHistoricalPromotionInputCurrentBeforeMutation({
        datasetGuard: {
          assertCurrentBeforeMutation: async () => {
            events.push("dataset");
            observedAccess.push(currentDatabaseAccess());
          },
        },
        client: {
          $queryRaw: jest.fn(async () => {
            events.push("publication");
            observedAccess.push(currentDatabaseAccess());
            return [sourcePublication];
          }) as never,
        },
        ...scope,
        date: "2026-08-01",
        sourcePublication,
      }),
      runProductionDay: productionDay,
    })).resolves.toBe(0);
    expect(events).toEqual(["dataset", "publication", "production-day"]);
    expect(observedAccess).toEqual([
      { kind: "tenant", ...scope },
      { kind: "tenant", ...scope },
    ]);
    expect(productionDay).toHaveBeenCalledTimes(1);
  });
});
