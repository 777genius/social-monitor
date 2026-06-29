import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { createScanPolicy } from "./scan-policy";
import { createSourceBinding } from "./source-binding";
import { createSourceProviderProfile } from "./source-provider";

describe("Ingestion DDD primitives", () => {
  it("normalizes source binding identity around provider and topic language", () => {
    expect(
      createSourceBinding({
        tenantId: tenantId("tenant-ingestion"),
        workspaceId: workspaceId("workspace-ingestion"),
        interestId: " topic-ai ",
        sourceBindingId: " binding-reddit ",
        providerKey: " reddit ",
      }),
    ).toMatchObject({
      interestId: "topic-ai",
      sourceBindingId: "binding-reddit",
      providerKey: "reddit",
    });
  });

  it("rejects scan policies where retry attempt exceeds the retry budget", () => {
    expect(() =>
      createScanPolicy({
        scanPolicyId: "scan-policy-1",
        attemptNumber: 4,
        retryBudget: 3,
      }),
    ).toThrow("Scan attempt number must not exceed retry budget");
  });

  it("allows zero retry budget for a single no-retry scan attempt", () => {
    expect(
      createScanPolicy({
        scanPolicyId: "scan-policy-no-retry",
        attemptNumber: 1,
        retryBudget: 0,
      }),
    ).toMatchObject({
      attemptNumber: 1,
      retryBudget: 0,
    });
    expect(() =>
      createScanPolicy({
        scanPolicyId: "scan-policy-no-retry",
        attemptNumber: 2,
        retryBudget: 0,
      }),
    ).toThrow("Scan attempt number must not exceed retry budget");
  });

  it("validates source provider capability profiles before adapters expose them", () => {
    expect(
      createSourceProviderProfile({
        providerKey: "reddit",
        displayName: "Reddit",
        version: 1,
        productionSafe: true,
        supportedContentUnits: ["post", "comment"],
        supportedQueryModes: ["listing", "search"],
        cursorModel: "opaque",
        stableIdentity: ["providerId", "canonicalUrl"],
        quotaModel: "per_app",
        limitations: ["Requires app credentials."],
      }),
    ).toMatchObject({
      providerKey: "reddit",
      cursorModel: "opaque",
    });
  });
});
