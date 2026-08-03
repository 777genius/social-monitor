import { createHash } from "node:crypto";

import { verifyReaderSummaryDailySourceAuthority } from "./reader-summary-daily-source-authority-snapshot";

const scope = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  requestedUtcDate: "2026-07-31",
};

describe("verifyReaderSummaryDailySourceAuthority", () => {
  it("accepts exact DB-derived bytes and retains them for the model", () => {
    const authority = snapshot();
    const verified = verifyReaderSummaryDailySourceAuthority({ ...scope, authority });
    expect(verified.items).toHaveLength(1);
    expect(verified.canonicalBytes.equals(authority.canonicalBytes)).toBe(true);
    expect(Object.isFrozen(verified.items)).toBe(true);
  });

  it.each([
    ["bytes", (authority: ReturnType<typeof snapshot>) => ({ ...authority, canonicalBytes: Buffer.from("{}") })],
    ["SHA", (authority: ReturnType<typeof snapshot>) => ({ ...authority, canonicalSha256: "0".repeat(64) })],
    ["cutoff", (authority: ReturnType<typeof snapshot>) => ({ ...authority, ingestionCutoff: "2026-08-01T00:00:01.000Z" })],
  ])("rejects divergent %s", (_label, mutate) => {
    expect(() => verifyReaderSummaryDailySourceAuthority({
      ...scope,
      authority: mutate(snapshot()),
    })).toThrow();
  });

  it("rejects an item observed after the sealed ingestion cutoff", () => {
    const authority = snapshot({ observedAt: "2026-08-01T00:00:01.000Z" });
    expect(() => verifyReaderSummaryDailySourceAuthority({ ...scope, authority })).toThrow(/out-of-window/u);
  });

  it("rejects invented authority v2 fields without normalizing the bytes", () => {
    const authority = snapshot({ providerPayload: { invented: true } });
    expect(() => verifyReaderSummaryDailySourceAuthority({
      ...scope, authority,
    })).toThrow(/outside authority v1/u);
  });
});

const snapshot = (itemPatch: Record<string, unknown> = {}) => {
  const record = {
    schemaVersion: 1,
    ...scope,
    ingestionCutoff: "2026-08-01T00:00:00.000Z",
    items: [{
      feedItemId: "30000000-0000-4000-8000-000000000003",
      sourceItemId: "40000000-0000-4000-8000-000000000004",
      providerKey: "github",
      canonicalUrl: "https://example.invalid/item",
      title: "Release",
      bodyPreview: "A deterministic fixture",
      authorHandle: null,
      publishedAt: "2026-07-31T12:00:00.000Z",
      observedAt: "2026-07-31T12:05:00.000Z",
      contentHash: "content-v1",
      ...itemPatch,
    }],
  };
  const canonicalBytes = Buffer.from(JSON.stringify(record), "utf8");
  return {
    requestedUtcDate: scope.requestedUtcDate,
    ingestionCutoff: record.ingestionCutoff,
    canonicalBytes,
    canonicalSha256: createHash("sha256").update(canonicalBytes).digest("hex"),
  };
};
