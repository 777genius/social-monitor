import { makeBinding, makeFixture, makePolicy, now, tenant, workspace } from "./list-interest-source-daily-history.spec-support";

describe("ListInterestSourceDailyHistoryUseCase", () => {
  it("aggregates scan history by day and provider for an interest", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    const github = makeBinding("binding-github", "github-trending-page");
    await fixture.bindings.save(reddit);
    await fixture.bindings.save(github);
    await fixture.policies.save(makePolicy(reddit, {
      intervalSeconds: 60,
      freshnessSeconds: 60,
    }));
    await fixture.policies.save(makePolicy(github, {
      intervalSeconds: 300,
      freshnessSeconds: 300,
    }));
    await fixture.saveCompletedScan({
      id: "scan-reddit-today",
      binding: reddit,
      requestedAt: "2026-06-26T08:00:00.000Z",
      status: "succeeded",
      fetched: 20,
      inserted: 12,
      skippedDuplicates: 8,
      projected: 12,
    });
    await fixture.saveCompletedScan({
      id: "scan-github-yesterday",
      binding: github,
      requestedAt: "2026-06-25T09:00:00.000Z",
      status: "failed",
      failureReason: "provider_rate_limited: github trending page returned 429",
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-source-history",
      days: 2,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        interestId: "interest-source-history",
        windowStartedAt: "2026-06-25T00:00:00.000Z",
        windowEndedAt: "2026-06-27T00:00:00.000Z",
        summary: expect.objectContaining({
          sourceBindingCount: 2,
          scannedSourceBindingCount: 2,
          unscannedSourceBindingCount: 0,
          scanCoverageState: "complete",
          totalScans: 2,
          succeededScans: 1,
          failedScans: 1,
          rateLimitedScans: 1,
          fetched: 20,
          inserted: 12,
          skippedDuplicates: 8,
          projected: 12,
          daysWithScans: 2,
          daysWithFailures: 1,
          daysWithRateLimits: 1,
          lastScanRequestedAt: "2026-06-26T08:00:00.000Z",
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "github-trending-page",
              sourceBindingCount: 1,
              scannedSourceBindingCount: 1,
              unscannedSourceBindingCount: 0,
              scanCoverageState: "complete",
              cadenceSummary: expect.objectContaining({
                minimumIntervalSeconds: 86400,
                minConfiguredIntervalSeconds: 300,
                maxEffectiveIntervalSeconds: 86400,
                providerMinimumIntervalEnforced: true,
              }),
              failedScans: 1,
              rateLimitedScans: 1,
            }),
            expect.objectContaining({
              providerKey: "reddit",
              sourceBindingCount: 1,
              scannedSourceBindingCount: 1,
              unscannedSourceBindingCount: 0,
              scanCoverageState: "complete",
              cadenceSummary: expect.objectContaining({
                minimumIntervalSeconds: 900,
                minConfiguredIntervalSeconds: 60,
                maxEffectiveIntervalSeconds: 900,
                providerMinimumIntervalEnforced: true,
              }),
              succeededScans: 1,
              fetched: 20,
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-25",
            scannedSourceBindingCount: 1,
            unscannedSourceBindingCount: 1,
            scanCoverageState: "partial",
            totalScans: 1,
            failedScans: 1,
            rateLimitedScans: 1,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "github-trending-page",
                scannedSourceBindingCount: 1,
                unscannedSourceBindingCount: 0,
                scanCoverageState: "complete",
                signals: expect.arrayContaining([
                  "provider_minimum_interval_enforced",
                ]),
                failedScans: 1,
              }),
              expect.objectContaining({
                providerKey: "reddit",
                scannedSourceBindingCount: 0,
                unscannedSourceBindingCount: 1,
                scanCoverageState: "none_scanned",
                totalScans: 0,
                signals: expect.arrayContaining([
                  "no_recent_scans",
                  "unscanned_source_bindings",
                  "no_scan_coverage",
                  "provider_minimum_interval_enforced",
                ]),
              }),
            ],
          }),
          expect.objectContaining({
            date: "2026-06-26",
            scannedSourceBindingCount: 1,
            unscannedSourceBindingCount: 1,
            scanCoverageState: "partial",
            totalScans: 1,
            succeededScans: 1,
            fetched: 20,
            signals: expect.arrayContaining([
              "partial_scan_coverage",
              "unscanned_source_bindings",
            ]),
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "github-trending-page",
                scannedSourceBindingCount: 0,
                unscannedSourceBindingCount: 1,
                scanCoverageState: "none_scanned",
                totalScans: 0,
                signals: expect.arrayContaining([
                  "no_recent_scans",
                  "unscanned_source_bindings",
                  "no_scan_coverage",
                  "provider_minimum_interval_enforced",
                ]),
              }),
              expect.objectContaining({
                providerKey: "reddit",
                scannedSourceBindingCount: 1,
                unscannedSourceBindingCount: 0,
                scanCoverageState: "complete",
                signals: expect.arrayContaining([
                  "recent_success",
                  "provider_minimum_interval_enforced",
                ]),
                succeededScans: 1,
              }),
            ],
          }),
        ],
        truncated: false,
        maxScanJobs: 400,
      }),
    });
  });

  it("filters interest scan history by provider key", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    const github = makeBinding("binding-github", "github-trending-page");
    await fixture.bindings.save(reddit);
    await fixture.bindings.save(github);
    await fixture.policies.save(makePolicy(reddit, {
      intervalSeconds: 900,
      freshnessSeconds: 900,
    }));
    await fixture.policies.save(makePolicy(github));
    await fixture.saveCompletedScan({
      id: "scan-reddit-today",
      binding: reddit,
      requestedAt: "2026-06-26T08:00:00.000Z",
      status: "succeeded",
      fetched: 20,
      inserted: 12,
      skippedDuplicates: 8,
      projected: 12,
    });
    await fixture.saveCompletedScan({
      id: "scan-github-yesterday",
      binding: github,
      requestedAt: "2026-06-25T09:00:00.000Z",
      status: "failed",
      failureReason: "provider_rate_limited: github trending page returned 429",
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-source-history",
      days: 2,
      providerKeys: ["reddit"],
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          sourceBindingCount: 1,
          scannedSourceBindingCount: 1,
          unscannedSourceBindingCount: 0,
          scanCoverageState: "complete",
          totalScans: 1,
          succeededScans: 1,
          failedScans: 0,
          rateLimitedScans: 0,
          daysWithScans: 1,
          daysWithFailures: 0,
          daysWithRateLimits: 0,
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "reddit",
              sourceBindingCount: 1,
              scannedSourceBindingCount: 1,
              unscannedSourceBindingCount: 0,
              scanCoverageState: "complete",
              cadenceSummary: expect.objectContaining({
                minimumIntervalSeconds: 900,
                minConfiguredIntervalSeconds: 900,
                maxEffectiveIntervalSeconds: 900,
                providerMinimumIntervalEnforced: false,
              }),
              succeededScans: 1,
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-25",
            scannedSourceBindingCount: 0,
            unscannedSourceBindingCount: 1,
            scanCoverageState: "none_scanned",
            totalScans: 0,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "reddit",
                scannedSourceBindingCount: 0,
                unscannedSourceBindingCount: 1,
                scanCoverageState: "none_scanned",
                totalScans: 0,
              }),
            ],
          }),
          expect.objectContaining({
            date: "2026-06-26",
            scannedSourceBindingCount: 1,
            unscannedSourceBindingCount: 0,
            scanCoverageState: "complete",
            totalScans: 1,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "reddit",
                scannedSourceBindingCount: 1,
                unscannedSourceBindingCount: 0,
                scanCoverageState: "complete",
                succeededScans: 1,
              }),
            ],
          }),
        ],
        truncated: false,
        maxScanJobs: 200,
      }),
    });
  });

  it("summarizes source binding readiness counts by interest and provider", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    const github = makeBinding("binding-github", "github-trending-page").pause();
    await fixture.bindings.save(reddit);
    await fixture.bindings.save(github);
    await fixture.policies.save(makePolicy(reddit, {
      intervalSeconds: 900,
      freshnessSeconds: 900,
    }));
    await fixture.saveCompletedScan({
      id: "scan-reddit-today",
      binding: reddit,
      requestedAt: "2026-06-26T08:00:00.000Z",
      status: "succeeded",
      fetched: 20,
      inserted: 12,
      skippedDuplicates: 8,
      projected: 12,
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-source-history",
      days: 1,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          sourceBindingCount: 2,
          enabledSourceBindingCount: 1,
          pausedSourceBindingCount: 1,
          configuredSourceBindingCount: 1,
          unconfiguredSourceBindingCount: 1,
          scannedSourceBindingCount: 1,
          unscannedSourceBindingCount: 1,
          scanCoverageState: "partial",
          operatorAction: "create_scan_policy_for_unconfigured_source_bindings",
          signals: expect.arrayContaining([
            "partial_scan_coverage",
            "paused_source_bindings",
            "unconfigured_source_bindings",
            "unscanned_source_bindings",
          ]),
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "github-trending-page",
              sourceBindingCount: 1,
              enabledSourceBindingCount: 0,
              pausedSourceBindingCount: 1,
              configuredSourceBindingCount: 0,
              unconfiguredSourceBindingCount: 1,
              scannedSourceBindingCount: 0,
              unscannedSourceBindingCount: 1,
              scanCoverageState: "none_scanned",
              cadenceSummary: undefined,
              operatorAction: "create_scan_policy_for_unconfigured_source_bindings",
              signals: expect.arrayContaining([
                "no_recent_scans",
                "paused_source_bindings",
                "unconfigured_source_bindings",
                "unscanned_source_bindings",
                "no_scan_coverage",
              ]),
              totalScans: 0,
            }),
            expect.objectContaining({
              providerKey: "reddit",
              sourceBindingCount: 1,
              enabledSourceBindingCount: 1,
              pausedSourceBindingCount: 0,
              configuredSourceBindingCount: 1,
              unconfiguredSourceBindingCount: 0,
              scannedSourceBindingCount: 1,
              unscannedSourceBindingCount: 0,
              scanCoverageState: "complete",
              cadenceSummary: expect.objectContaining({
                sourceBindingCount: 1,
              }),
              succeededScans: 1,
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-26",
            sourceBindingCount: 2,
            enabledSourceBindingCount: 1,
            pausedSourceBindingCount: 1,
            configuredSourceBindingCount: 1,
            unconfiguredSourceBindingCount: 1,
            scannedSourceBindingCount: 1,
            unscannedSourceBindingCount: 1,
            scanCoverageState: "partial",
            operatorAction: "create_scan_policy_for_unconfigured_source_bindings",
            signals: expect.arrayContaining([
              "partial_scan_coverage",
              "paused_source_bindings",
              "unconfigured_source_bindings",
              "unscanned_source_bindings",
            ]),
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "github-trending-page",
                pausedSourceBindingCount: 1,
                unconfiguredSourceBindingCount: 1,
                scannedSourceBindingCount: 0,
                unscannedSourceBindingCount: 1,
                scanCoverageState: "none_scanned",
                signals: expect.arrayContaining([
                  "no_scan_coverage",
                  "unscanned_source_bindings",
                  "unconfigured_source_bindings",
                  "paused_source_bindings",
                ]),
              }),
              expect.objectContaining({
                providerKey: "reddit",
                enabledSourceBindingCount: 1,
                configuredSourceBindingCount: 1,
                scannedSourceBindingCount: 1,
                unscannedSourceBindingCount: 0,
                scanCoverageState: "complete",
              }),
            ],
          }),
        ],
      }),
    });
  });

  it("includes scheduler decision history in daily provider freshness", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    const github = makeBinding("binding-github", "github-trending-page");
    await fixture.bindings.save(reddit);
    await fixture.bindings.save(github);
    await fixture.policies.save(makePolicy(reddit));
    await fixture.policies.save(makePolicy(github));
    await fixture.saveSchedulerDecision({
      id: "scheduler-decision-reddit-fresh",
      decisionKey:
        "scan-policy:scan-policy-binding-reddit:due-at:2026-06-26T08:00:00.000Z",
      scanPolicyId: "scan-policy-binding-reddit",
      sourceBindingId: "binding-reddit",
      providerKey: "reddit",
      decision: "skipped",
      reason: "fresh_success",
      policyDueAt: new Date("2026-06-26T08:00:00.000Z"),
      evaluatedAt: new Date("2026-06-26T08:00:00.000Z"),
      nextRunAt: new Date("2026-06-26T08:15:00.000Z"),
      configuredIntervalSeconds: 900,
      effectiveIntervalSeconds: 900,
      freshnessSeconds: 900,
      providerMinimumIntervalEnforced: false,
      correlationId: "scheduler-history-test",
      causationId: "scheduled:scan-policy-binding-reddit",
    });
    await fixture.saveSchedulerDecision({
      id: "scheduler-decision-github-enqueued",
      decisionKey:
        "scan-policy:scan-policy-binding-github:due-at:2026-06-26T09:00:00.000Z",
      scanPolicyId: "scan-policy-binding-github",
      sourceBindingId: "binding-github",
      providerKey: "github-trending-page",
      decision: "enqueued",
      reason: "scan_policy_due_now",
      scanJobId: "scan-github-today",
      policyDueAt: new Date("2026-06-26T09:00:00.000Z"),
      evaluatedAt: new Date("2026-06-26T09:00:00.000Z"),
      nextRunAt: new Date("2026-06-26T10:00:00.000Z"),
      configuredIntervalSeconds: 300,
      effectiveIntervalSeconds: 3600,
      freshnessSeconds: 3600,
      providerMinimumIntervalEnforced: true,
      correlationId: "scheduler-history-test",
      causationId: "scheduled:scan-policy-binding-github",
    });
    await fixture.saveSchedulerDecision({
      id: "scheduler-decision-github-backpressure",
      decisionKey:
        "scan-policy:scan-policy-binding-github:due-at:2026-06-26T10:00:00.000Z",
      scanPolicyId: "scan-policy-binding-github",
      sourceBindingId: "binding-github",
      providerKey: "github-trending-page",
      decision: "skipped",
      reason: "queue_backpressure",
      policyDueAt: new Date("2026-06-26T10:00:00.000Z"),
      evaluatedAt: new Date("2026-06-26T10:00:00.000Z"),
      nextRunAt: new Date("2026-06-26T11:00:00.000Z"),
      configuredIntervalSeconds: 300,
      effectiveIntervalSeconds: 3600,
      freshnessSeconds: 3600,
      providerMinimumIntervalEnforced: true,
      correlationId: "scheduler-history-test",
      causationId: "scheduled:scan-policy-binding-github",
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-source-history",
      days: 1,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          schedulerDecisionCount: 3,
          schedulerEnqueuedCount: 1,
          schedulerSkippedCount: 2,
          schedulerSkippedByReason: expect.objectContaining({
            freshSuccess: 1,
            queueBackpressure: 1,
          }),
          lastSchedulerEvaluatedAt: "2026-06-26T10:00:00.000Z",
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "github-trending-page",
              schedulerDecisionCount: 2,
              schedulerEnqueuedCount: 1,
              schedulerSkippedCount: 1,
              schedulerSkippedByReason: expect.objectContaining({
                queueBackpressure: 1,
              }),
              lastSchedulerEvaluatedAt: "2026-06-26T10:00:00.000Z",
            }),
            expect.objectContaining({
              providerKey: "reddit",
              schedulerDecisionCount: 1,
              schedulerEnqueuedCount: 0,
              schedulerSkippedCount: 1,
              schedulerSkippedByReason: expect.objectContaining({
                freshSuccess: 1,
              }),
              lastSchedulerEvaluatedAt: "2026-06-26T08:00:00.000Z",
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-26",
            schedulerDecisionCount: 3,
            schedulerEnqueuedCount: 1,
            schedulerSkippedCount: 2,
            schedulerSkippedByReason: expect.objectContaining({
              freshSuccess: 1,
              queueBackpressure: 1,
            }),
            lastSchedulerEvaluatedAt: "2026-06-26T10:00:00.000Z",
          }),
        ],
      }),
    });
  });

  it("uses scheduler backoff decisions when provider health has no scan jobs yet", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    await fixture.bindings.save(reddit);
    await fixture.policies.save(makePolicy(reddit));
    await fixture.saveSchedulerDecision({
      id: "scheduler-decision-reddit-provider-backoff",
      decisionKey:
        "scan-policy:scan-policy-binding-reddit:due-at:2026-06-26T09:00:00.000Z",
      scanPolicyId: "scan-policy-binding-reddit",
      sourceBindingId: "binding-reddit",
      providerKey: "reddit",
      decision: "skipped",
      reason: "provider_failure_backoff",
      policyDueAt: new Date("2026-06-26T09:00:00.000Z"),
      evaluatedAt: new Date("2026-06-26T09:00:00.000Z"),
      nextRunAt: new Date("2026-06-26T09:15:00.000Z"),
      configuredIntervalSeconds: 300,
      effectiveIntervalSeconds: 900,
      freshnessSeconds: 900,
      providerMinimumIntervalEnforced: true,
      backoffUntil: new Date("2026-06-26T09:15:00.000Z"),
      correlationId: "scheduler-history-provider-backoff",
      causationId: "scheduled:scan-policy-binding-reddit",
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-source-history",
      days: 1,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          providerHealthState: "down",
          totalScans: 0,
          schedulerSkippedByReason: expect.objectContaining({
            providerFailureBackoff: 1,
          }),
          operatorAction: "pause_or_backoff_provider_until_recovery",
          signals: expect.arrayContaining([
            "no_recent_scans",
            "provider_failure_backoff",
          ]),
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "reddit",
              providerHealthState: "down",
              totalScans: 0,
              schedulerSkippedByReason: expect.objectContaining({
                providerFailureBackoff: 1,
              }),
              operatorAction: "pause_or_backoff_provider_until_recovery",
              signals: expect.arrayContaining([
                "no_recent_scans",
                "provider_failure_backoff",
              ]),
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-26",
            providerHealthState: "down",
            schedulerSkippedByReason: expect.objectContaining({
              providerFailureBackoff: 1,
            }),
            operatorAction: "pause_or_backoff_provider_until_recovery",
            signals: expect.arrayContaining([
              "no_recent_scans",
              "provider_failure_backoff",
            ]),
          }),
        ],
      }),
    });
  });

  it("returns scoped interest errors before reading scan history", async () => {
    const fixture = await makeFixture();

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "missing-interest",
      days: 7,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "resource.not_found" }),
    });
  });

  it("rejects invalid history windows", async () => {
    const fixture = await makeFixture();

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: "interest-source-history",
      days: 91,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
  });
});
