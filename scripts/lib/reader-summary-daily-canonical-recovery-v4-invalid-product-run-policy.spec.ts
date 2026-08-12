import type {
  CanonicalRecoveryPublication,
  CanonicalRecoveryUnavailable,
} from "./reader-summary-daily-canonical-recovery-v4";
import {
  assertExactFinalizedTargetSet,
  runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-run-policy";
import { invalidProductRetryDates } from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";
import {
  readerSummaryDailyTerminalSetReceiptTenantId as tenantId,
  readerSummaryDailyTerminalSetReceiptWorkspaceId as workspaceId,
} from "./reader-summary-daily-terminal-set-receipt";

describe("daily canonical recovery v4 invalid-product run policy", () => {
  it("performs zero authorizer and executor calls for an invalid precondition", async () => {
    const dependencies = fakes();

    await expect(
      runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct({
        ...dependencies.input,
        tenantId: "00000000-0000-7000-8000-000000000999",
      }),
    ).rejects.toThrow(/precondition/u);

    expect(dependencies.checkHealth).not.toHaveBeenCalled();
    expect(dependencies.authorize).not.toHaveBeenCalled();
    expect(dependencies.runOne).not.toHaveBeenCalled();
  });

  it("performs zero authorizer and executor calls when live identity fails", async () => {
    const dependencies = fakes();
    dependencies.checkHealth.mockResolvedValueOnce({
      status: "degraded",
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      launcherSha256: "a".repeat(64),
      warnings: [],
    });

    await expect(
      runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct(
        dependencies.input,
      ),
    ).rejects.toThrow(/identity is not production-safe/u);

    expect(dependencies.authorize).not.toHaveBeenCalled();
    expect(dependencies.runOne).not.toHaveBeenCalled();
  });

  it("performs zero executor calls when authorization coverage is invalid", async () => {
    const dependencies = fakes();
    dependencies.authorize.mockResolvedValueOnce([]);

    await expect(
      runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct(
        dependencies.input,
      ),
    ).rejects.toThrow(/authorization is invalid/u);

    expect(dependencies.authorize).toHaveBeenCalledTimes(1);
    expect(dependencies.runOne).not.toHaveBeenCalled();
  });

  it("uses the same live client immediately before authorization and then executes", async () => {
    const calls: string[] = [];
    const dependencies = fakes({
      onHealth: () => calls.push("health"),
      onAuthorize: () => calls.push("authorize"),
      onRunOne: () => calls.push("runOne"),
    });
    dependencies.runOne.mockImplementationOnce(async () => {
      calls.push("runOne");
      return caughtUp();
    });

    await expect(
      runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct(
        dependencies.input,
      ),
    ).resolves.toEqual(caughtUp());

    expect(calls).toEqual(["health", "authorize", "runOne"]);
  });

  it.each([
    ["leased", { kind: "leased", requestedUtcDate: "2026-07-25" }],
    [
      "ambiguous",
      {
        kind: "failed_ambiguous",
        requestedUtcDate: "2026-07-25",
        modelJobIdentity: "a".repeat(64),
        sourceAuthoritySha256: "b".repeat(64),
        attemptOrdinal: 2,
      },
    ],
  ] as const)("fails fast on the first %s outcome", async (_label, outcome) => {
    const dependencies = fakes();
    dependencies.runOne.mockResolvedValueOnce(outcome as never);

    await expect(
      runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct(
        dependencies.input,
      ),
    ).rejects.toThrow(/leased|unavailable/u);

    expect(dependencies.runOne).toHaveBeenCalledTimes(1);
  });

  it("fails on the first target unavailable terminal", async () => {
    const dependencies = fakes();
    dependencies.runOne.mockResolvedValueOnce(
      caughtUp({
        unavailable: [unavailable("2026-07-27")],
        publications: invalidProductRetryDates
          .filter((date) => date !== "2026-07-27")
          .map(publication),
      }),
    );

    await expect(
      runReaderSummaryDailyCanonicalRecoveryV4InvalidProduct(
        dependencies.input,
      ),
    ).rejects.toThrow("unavailable at 2026-07-27");
    expect(dependencies.runOne).toHaveBeenCalledTimes(1);
  });

  it("accepts exactly six unique target finals plus Jul23/Jul24 terminals", () => {
    expect(() =>
      assertExactFinalizedTargetSet(
        caughtUp({
          publications: [
            publication("2026-07-23"),
            ...invalidProductRetryDates.map(publication),
          ],
          unavailable: [unavailable("2026-07-24")],
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["missing", invalidProductRetryDates.slice(1).map(publication), []],
    [
      "duplicate",
      [...invalidProductRetryDates.map(publication), publication("2026-07-25")],
      [],
    ],
    [
      "widened",
      [...invalidProductRetryDates.map(publication), publication("2026-07-31")],
      [],
    ],
  ] as const)(
    "rejects a %s finalized target set",
    (_label, publications, unavailableRows) => {
      expect(() =>
        assertExactFinalizedTargetSet(
          caughtUp({
            publications,
            unavailable: unavailableRows,
          }),
        ),
      ).toThrow(/set/u);
    },
  );
});

const fakes = (
  hooks: Readonly<{
    onHealth?: () => void;
    onAuthorize?: () => void;
    onRunOne?: () => void;
  }> = {},
) => {
  const checkHealth = jest.fn(async () => {
    hooks.onHealth?.();
    return {
      status: "serving" as const,
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      launcherSha256: "a".repeat(64),
      warnings: [],
    };
  });
  const authorize = jest.fn(async () => {
    hooks.onAuthorize?.();
    return invalidProductRetryDates.map((requestedUtcDate, index) => ({
      requestedUtcDate,
      modelJobIdentity: String(index + 1).repeat(64),
      authorizationSha256: String(index + 2).repeat(64),
    }));
  });
  const runOne = jest.fn(async () => {
    hooks.onRunOne?.();
    return caughtUp();
  });
  return {
    checkHealth,
    authorize,
    runOne,
    input: {
      tenantId,
      workspaceId,
      workerId: "invalid-product-worker",
      terminalSetSha256: "f".repeat(64),
      runtimeServiceToken: "authenticated-service-token",
      runtimeClient: { checkHealth },
      authorizer: { authorize },
      executor: { runOne },
      now: () => new Date("2026-08-11T10:00:00.000Z"),
    },
  };
};

function caughtUp(
  override: Readonly<{
    publications?: readonly CanonicalRecoveryPublication[];
    unavailable?: readonly CanonicalRecoveryUnavailable[];
  }> = {},
) {
  return {
    kind: "caught_up" as const,
    publications:
      override.publications ?? invalidProductRetryDates.map(publication),
    unavailable: override.unavailable ?? [],
  };
}

function publication(requestedUtcDate: string): CanonicalRecoveryPublication {
  return { requestedUtcDate } as CanonicalRecoveryPublication;
}

function unavailable(requestedUtcDate: string): CanonicalRecoveryUnavailable {
  return {
    requestedUtcDate,
    reasonCode: "model_result_not_durably_persisted_after_consumed_attempt",
    signalCount: 1,
    sourceAuthoritySha256: "a".repeat(64),
    modelJobIdentity: "b".repeat(64),
    attemptOrdinal: 1,
  } as CanonicalRecoveryUnavailable;
}
