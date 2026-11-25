import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { productionHistoryCollection } from "./reader-summary-production-history-collection";

describe("production history collection", () => {
  it("authorizes unproven rows only before the exact dated artifact exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-history-"));
    try {
      const first = productionHistoryCollection({
        directory,
        collectionDate: "2026-08-07",
        evaluatedAt: new Date("2026-08-27T12:00:00.000Z"),
      })!;
      expect(first.arguments).toContain("--allow-unproven-existing-window");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        first.path,
        `${JSON.stringify(partialReport("2026-08-07"))}\n`,
      );
      const retry = productionHistoryCollection({
        directory,
        collectionDate: "2026-08-07",
        evaluatedAt: new Date("2026-08-27T12:00:00.000Z"),
      })!;
      expect(retry.arguments).not.toContain("--allow-unproven-existing-window");
      expect(retry.arguments).toEqual([
        "--production-history-retry",
        "--artifact-directory",
        directory,
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses scheduled evidence semantics when maintenance targets UTC yesterday", () => {
    const directory = mkdtempSync(join(tmpdir(), "production-previous-day-"));
    try {
      const collection = productionHistoryCollection({
        directory,
        collectionDate: "2026-08-26",
        evaluatedAt: new Date("2026-08-27T12:00:00.000Z"),
      })!;
      expect(collection.arguments).toEqual([
        "--production-scheduled-scope",
        "--exact-date-artifact-directory",
        directory,
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a malformed exact-day artifact instead of entering retry", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "production-history-corrupt-"),
    );
    try {
      const path = join(
        directory,
        "reader-summary-clean-real-day-collection.2026-08-07.v1.json",
      );
      writeFileSync(path, "truncated evidence\n");
      expect(() =>
        productionHistoryCollection({
          directory,
          collectionDate: "2026-08-07",
          evaluatedAt: new Date("2026-08-27T12:00:00.000Z"),
        }),
      ).toThrow("unreadable; refusing provider recollection");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const partialReport = (collectionDate: string) => ({
  schemaVersion: 1,
  artifactFormat: "reader-summary-clean-real-day-collection-v1",
  generatedBy: "npm run run:reader-summary-clean-real-day-collection",
  run: { collectionDate },
  inputs: {
    database: "local-postgres",
    targetPublishedWindow: {
      startInclusive: `${collectionDate}T00:00:00.000Z`,
      endExclusive: "2026-08-08T00:00:00.000Z",
    },
    scope: {
      tenantId: "00000000-0000-7000-8000-000000006101",
      workspaceId: "00000000-0000-7000-8000-000000006102",
    },
  },
});
