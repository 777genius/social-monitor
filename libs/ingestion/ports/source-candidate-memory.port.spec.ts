import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { NOOP_SOURCE_CANDIDATE_MEMORY } from "./source-candidate-memory.port";

describe("NOOP_SOURCE_CANDIDATE_MEMORY", () => {
  it("fails open and never suppresses candidates", async () => {
    const result = await NOOP_SOURCE_CANDIDATE_MEMORY.screen({
      tenantId: tenantId("tenant-memory"),
      workspaceId: workspaceId("workspace-memory"),
      interestId: "interest-memory",
      sourceBindingId: "binding-memory",
      providerKey: "x-twitter",
      scopeFingerprint: "scope-v1",
      policyVersion: "policy-v1",
      screenedAt: new Date("2026-07-11T00:00:00.000Z"),
      candidates: [
        {
          externalId: "x-twitter:1",
          fingerprint: "fingerprint-1",
          contentFingerprint: "content-1",
        },
      ],
    });

    expect(result).toEqual({
      suppressedExternalIds: [],
      activeRecords: [],
    });
  });
});
