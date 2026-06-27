import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryPolicy,
  defaultReaderSummaryGenerationPolicy,
  defaultReaderSummaryScheduleSettings,
} from "./reader-summary-policy";

describe("ReaderSummaryPolicy", () => {
  it("creates the default reader summary policy for a workspace scope", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");

    const policy = ReaderSummaryPolicy.defaultForScope({
      id: "reader-summary-policy-1",
      tenantId: tenantId("tenant-reader-summary-policy"),
      workspaceId: workspaceId("workspace-reader-summary-policy"),
      scope: { type: "workspace" },
      now,
    });

    expect(policy.toGenerationPolicy()).toEqual(
      defaultReaderSummaryGenerationPolicy(),
    );
    expect(policy.toScheduleSettings()).toEqual(
      defaultReaderSummaryScheduleSettings(),
    );
    expect(policy.toSnapshot()).toEqual(
      expect.objectContaining({
        id: "reader-summary-policy-1",
        scope: { type: "workspace" },
        schedule: defaultReaderSummaryScheduleSettings(),
        rulesVersion: "reader_summary.rules.policy.v1",
        createdAt: now,
        updatedAt: now,
      }),
    );
  });

  it("rejects invalid topic scopes before policy persistence", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");

    expect(() =>
      ReaderSummaryPolicy.defaultForScope({
        id: "reader-summary-policy-invalid",
        tenantId: tenantId("tenant-reader-summary-policy-invalid"),
        workspaceId: workspaceId("workspace-reader-summary-policy-invalid"),
        scope: { type: "topic", topicId: " " },
        now,
      }),
    ).toThrow("Reader summary topic scope topic id must be non-empty");
  });

  it("normalizes schedule settings and rejects unsupported scheduled cadences", () => {
    const now = new Date("2026-06-22T10:00:00.000Z");

    const policy = ReaderSummaryPolicy.create({
      id: "reader-summary-policy-schedule",
      tenantId: tenantId("tenant-reader-summary-policy-schedule"),
      workspaceId: workspaceId("workspace-reader-summary-policy-schedule"),
      scope: { type: "workspace" },
      ...defaultReaderSummaryGenerationPolicy(),
      schedule: {
        enabled: true,
        timezone: "Europe/Kiev",
        cadences: ["weekly", "weekly", "monthly"],
      },
      createdAt: now,
      updatedAt: now,
    });

    expect(policy.toScheduleSettings()).toEqual({
      enabled: true,
      timezone: "Europe/Kiev",
      cadences: ["weekly", "monthly"],
    });

    expect(() =>
      ReaderSummaryPolicy.create({
        id: "reader-summary-policy-invalid-cadence",
        tenantId: tenantId("tenant-reader-summary-policy-invalid-cadence"),
        workspaceId: workspaceId("workspace-reader-summary-policy-invalid-cadence"),
        scope: { type: "workspace" },
        ...defaultReaderSummaryGenerationPolicy(),
        schedule: {
          enabled: true,
          timezone: "UTC",
          cadences: ["custom" as unknown as "weekly"],
        },
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow("Unsupported reader summary scheduled cadence");
  });
});
