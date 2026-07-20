import {
  probeProductionRuntimeLiveIdentity,
  runtimeLiveIdentityProofRequired,
  serializeProductionRuntimeLiveIdentity,
} from "./reader-summary-runtime-live-identity";

describe("production runtime live identity proof", () => {
  it("never treats historical reuse as a live runtime proof", () => {
    expect(runtimeLiveIdentityProofRequired("live-production")).toBe(true);
    expect(runtimeLiveIdentityProofRequired("historical-regeneration")).toBe(
      true,
    );
    expect(runtimeLiveIdentityProofRequired("historical-reuse")).toBe(false);
  });
  it("accepts an exact serving runtime identity", async () => {
    const identity = await probeProductionRuntimeLiveIdentity({
      checkedAt: "2026-07-17T10:00:00.000Z",
      client: client(),
    });

    expect(identity).toMatchObject({
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "0.1.0-main.2",
      launcherSha256: "a".repeat(64),
    });
    expect(serializeProductionRuntimeLiveIdentity(identity).at(-1)).toBe(10);
  });

  it.each([
    ["degraded", { status: "degraded" }],
    ["direct runtime", { runtimeEngine: "direct" }],
    ["unknown version", { runtimeVersion: "unknown" }],
    ["missing launcher identity", { launcherSha256: undefined }],
  ] as const)("fails closed for %s", async (_label, override) => {
    await expect(
      probeProductionRuntimeLiveIdentity({
        checkedAt: "2026-07-17T10:00:00.000Z",
        client: client(override),
      }),
    ).rejects.toThrow("not production-safe");
  });
});

const client = (override: Record<string, unknown> = {}) => ({
  checkHealth: async () => ({
    status: "serving" as const,
    runtimeEngine: "subscription-runtime-cli",
    runtimeVersion: "0.1.0-main.2",
    launcherSha256: "a".repeat(64),
    warnings: [],
    ...override,
  }),
});
