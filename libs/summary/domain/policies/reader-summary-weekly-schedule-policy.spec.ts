import {
  decideReaderSummaryWeeklyRetry,
  deriveReaderSummaryWeeklyScheduleSlot,
  planReaderSummaryWeeklyCatchUp,
  READER_SUMMARY_WEEKLY_MAX_CATCH_UP_SLOTS,
  READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS,
  type ReaderSummaryWeeklyFailureCategory,
  type ReaderSummaryWeeklyScheduleSlot,
  type ReaderSummaryWeeklySlotObservation,
} from "./reader-summary-weekly-schedule-policy";

describe("reader summary weekly schedule policy", () => {
  const tenantId = "tenant:weekly-policy";
  const workspaceId = "workspace:weekly-policy";

  const slot = (
    weekStartedUtcDate: string,
    overrides: Partial<{
      tenantId: string;
      workspaceId: string;
      weekEndedUtcDate: string;
    }> = {},
  ): ReaderSummaryWeeklyScheduleSlot => {
    const start = Date.parse(`${weekStartedUtcDate}T00:00:00.000Z`);
    return deriveReaderSummaryWeeklyScheduleSlot({
      tenantId: overrides.tenantId ?? tenantId,
      workspaceId: overrides.workspaceId ?? workspaceId,
      weekStartedUtcDate,
      weekEndedUtcDate:
        overrides.weekEndedUtcDate ??
        new Date(start + 6 * 86_400_000).toISOString().slice(0, 10),
    });
  };

  const observation = (
    weekStartedUtcDate: string,
    state: ReaderSummaryWeeklySlotObservation["state"],
  ): ReaderSummaryWeeklySlotObservation => ({
    slot: slot(weekStartedUtcDate),
    state,
  });

  const plan = (
    overrides: Partial<Parameters<typeof planReaderSummaryWeeklyCatchUp>[0]> = {},
  ) =>
    planReaderSummaryWeeklyCatchUp({
      tenantId,
      workspaceId,
      firstWeekStartedUtcDate: "2026-06-29",
      now: new Date("2026-07-27T00:00:00.000Z"),
      catchUpLimit: 10,
      observedSlots: [],
      ...overrides,
    });

  describe("closed UTC week selection", () => {
    it.each([
      {
        label: "Sunday start",
        now: "2026-07-05T00:00:00.000Z",
        expectedStarts: [],
      },
      {
        label: "last millisecond Sunday",
        now: "2026-07-05T23:59:59.999Z",
        expectedStarts: [],
      },
      {
        label: "Monday closure boundary",
        now: "2026-07-06T00:00:00.000Z",
        expectedStarts: ["2026-06-29"],
      },
      {
        label: "midweek",
        now: "2026-07-08T12:34:56.789Z",
        expectedStarts: ["2026-06-29"],
      },
      {
        label: "next Sunday end",
        now: "2026-07-12T23:59:59.999Z",
        expectedStarts: ["2026-06-29"],
      },
      {
        label: "next Monday boundary",
        now: "2026-07-13T00:00:00.000Z",
        expectedStarts: ["2026-06-29", "2026-07-06"],
      },
    ])(
      "emits only fully closed Monday-Sunday slots at $label",
      ({ now, expectedStarts }) => {
        const result = plan({
          now: new Date(now),
          firstWeekStartedUtcDate: "2026-06-29",
        });

        expect(
          result.slots.map((candidate) => candidate.weekStartedUtcDate),
        ).toEqual(expectedStarts);
        expect(
          result.slots.map((candidate) => candidate.weekEndedUtcDate),
        ).toEqual(
          expectedStarts.map((start) =>
            new Date(
              Date.parse(`${start}T00:00:00.000Z`) + 6 * 86_400_000,
            )
              .toISOString()
              .slice(0, 10),
          ),
        );
        expect(result.slots).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ weekStartedUtcDate: "2026-07-13" }),
          ]),
        );
      },
    );

    it("uses UTC across year and leap-day boundaries", () => {
      const yearBoundary = plan({
        firstWeekStartedUtcDate: "2025-12-29",
        now: new Date("2026-01-05T00:00:00.000Z"),
      });
      const leapBoundary = plan({
        firstWeekStartedUtcDate: "2024-02-26",
        now: new Date("2024-03-04T00:00:00.000Z"),
      });

      expect(yearBoundary.slots).toMatchObject([
        {
          weekStartedUtcDate: "2025-12-29",
          weekEndedUtcDate: "2026-01-04",
          timezone: "UTC",
        },
      ]);
      expect(leapBoundary.slots).toMatchObject([
        {
          weekStartedUtcDate: "2024-02-26",
          weekEndedUtcDate: "2024-03-03",
          timezone: "UTC",
        },
      ]);
    });

    it("does not emit a future or current partial first week", () => {
      expect(
        plan({
          firstWeekStartedUtcDate: "2026-07-27",
          now: new Date("2026-07-29T08:00:00.000Z"),
        }),
      ).toMatchObject({
        slots: [],
        closedSlotCount: 0,
        deferredSlotCount: 0,
      });
      expect(
        plan({
          firstWeekStartedUtcDate: "2026-08-03",
          now: new Date("2026-07-29T08:00:00.000Z"),
        }).slots,
      ).toEqual([]);
    });
  });

  describe("slot identity", () => {
    it("is deterministic, immutable and bound only to scope and week", () => {
      const first = slot("2026-07-06");
      const replay = deriveReaderSummaryWeeklyScheduleSlot({
        tenantId,
        workspaceId,
        weekStartedUtcDate: "2026-07-06",
        weekEndedUtcDate: "2026-07-12",
      });

      expect(replay).toEqual(first);
      expect(first.identity).toMatch(
        /^reader_summary\.weekly_schedule_slot\.v1:[0-9a-f]{64}$/u,
      );
      expect(first.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(Object.isFrozen(first)).toBe(true);
      expect(first).not.toHaveProperty("attempt");
      expect(first).not.toHaveProperty("retry");
      expect(() =>
        deriveReaderSummaryWeeklyScheduleSlot({
          tenantId,
          workspaceId,
          weekStartedUtcDate: "2026-07-06",
          weekEndedUtcDate: "2026-07-12",
          attemptNumber: 2,
        } as never),
      ).toThrow("must contain exactly");
    });

    it.each([
      {
        label: "tenant",
        changes: { tenantId: "tenant:other" },
      },
      {
        label: "workspace",
        changes: { workspaceId: "workspace:other" },
      },
      {
        label: "week start and end",
        changes: {
          weekStartedUtcDate: "2026-07-13",
          weekEndedUtcDate: "2026-07-19",
        },
      },
    ])("diverges for a different $label binding", ({ changes }) => {
      const baseline = slot("2026-07-06");
      const divergent = deriveReaderSummaryWeeklyScheduleSlot({
        tenantId,
        workspaceId,
        weekStartedUtcDate: "2026-07-06",
        weekEndedUtcDate: "2026-07-12",
        ...changes,
      });

      expect(divergent.identity).not.toBe(baseline.identity);
      expect(divergent.sha256).not.toBe(baseline.sha256);
    });

    it("rejects non-Monday starts and non-Sunday ends", () => {
      expect(() =>
        deriveReaderSummaryWeeklyScheduleSlot({
          tenantId,
          workspaceId,
          weekStartedUtcDate: "2026-07-07",
          weekEndedUtcDate: "2026-07-13",
        }),
      ).toThrow("must start on Monday");
      expect(() =>
        deriveReaderSummaryWeeklyScheduleSlot({
          tenantId,
          workspaceId,
          weekStartedUtcDate: "2026-07-06",
          weekEndedUtcDate: "2026-07-13",
        }),
      ).toThrow("must cover Monday through Sunday");
    });
  });

  describe("catch-up and persisted state", () => {
    it("plans missed weeks oldest-first and applies the explicit bound", () => {
      const result = plan({
        firstWeekStartedUtcDate: "2026-05-25",
        now: new Date("2026-07-27T00:00:00.000Z"),
        catchUpLimit: 3,
      });

      expect(
        result.slots.map((candidate) => candidate.weekStartedUtcDate),
      ).toEqual(["2026-05-25", "2026-06-01", "2026-06-08"]);
      expect(result).toMatchObject({
        closedSlotCount: 9,
        occupiedSlotCount: 0,
        deferredSlotCount: 6,
      });
    });

    it("skips completed, active and terminal identities idempotently", () => {
      const observedSlots = [
        observation("2026-07-06", "active"),
        observation("2026-06-29", "completed"),
        observation("2026-07-13", "terminal"),
      ] as const;
      const first = plan({ observedSlots });
      const replay = plan({ observedSlots: [...observedSlots].reverse() });

      expect(
        first.slots.map((candidate) => candidate.weekStartedUtcDate),
      ).toEqual(["2026-07-20"]);
      expect(first).toMatchObject({
        closedSlotCount: 4,
        occupiedSlotCount: 3,
        deferredSlotCount: 0,
      });
      expect(replay).toEqual(first);
    });

    it("continues oldest-first past occupied identities until the bound", () => {
      const result = plan({
        firstWeekStartedUtcDate: "2026-05-25",
        catchUpLimit: 2,
        observedSlots: [
          observation("2026-05-25", "completed"),
          observation("2026-06-01", "active"),
        ],
      });

      expect(
        result.slots.map((candidate) => candidate.weekStartedUtcDate),
      ).toEqual(["2026-06-08", "2026-06-15"]);
      expect(result.deferredSlotCount).toBe(5);
    });

    it("rejects duplicate state even when duplicate statuses agree", () => {
      expect(() =>
        plan({
          observedSlots: [
            observation("2026-06-29", "completed"),
            observation("2026-06-29", "completed"),
          ],
        }),
      ).toThrow("contains duplicate identity");
    });

    it.each([
      {
        label: "forged identity",
        observedSlots: [
          {
            slot: { ...slot("2026-06-29"), identity: "forged" },
            state: "completed",
          },
        ],
        message: "identity binding diverged",
      },
      {
        label: "other tenant",
        observedSlots: [
          {
            slot: slot("2026-06-29", { tenantId: "tenant:other" }),
            state: "completed",
          },
        ],
        message: "diverges from planning scope",
      },
      {
        label: "before policy start",
        observedSlots: [observation("2026-06-22", "completed")],
        message: "diverges from planning scope",
      },
      {
        label: "current incomplete week",
        observedSlots: [observation("2026-07-27", "active")],
        message: "diverges from planning scope",
      },
      {
        label: "unknown state",
        observedSlots: [
          { slot: slot("2026-06-29"), state: "retrying" as never },
        ],
        message: "slot state is invalid",
      },
    ])(
      "fails closed for $label state",
      ({ observedSlots, message }) => {
        expect(() =>
          plan({
            observedSlots: observedSlots as ReaderSummaryWeeklySlotObservation[],
          }),
        ).toThrow(message);
      },
    );

    it("rejects malformed planning boundaries and catch-up limits", () => {
      expect(() =>
        plan({ firstWeekStartedUtcDate: "2026-07-01" }),
      ).toThrow("must start on Monday");
      expect(() => plan({ now: new Date(Number.NaN) })).toThrow(
        "must be a valid Date",
      );
      for (const catchUpLimit of [
        0,
        1.5,
        READER_SUMMARY_WEEKLY_MAX_CATCH_UP_SLOTS + 1,
      ]) {
        expect(() => plan({ catchUpLimit })).toThrow(
          "catch-up limit is outside the hard bound",
        );
      }
    });

    it("returns deeply immutable plans", () => {
      const result = plan();

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.slots)).toBe(true);
      expect(result.slots.every(Object.isFrozen)).toBe(true);
    });
  });

  describe("retry decisions", () => {
    const retry = (
      attemptNumber: number,
      category: ReaderSummaryWeeklyFailureCategory,
      retryable: boolean,
    ) =>
      decideReaderSummaryWeeklyRetry({
        attemptNumber,
        failure: { category, retryable },
      });

    it("retries only caller-classified retryable infrastructure outcomes", () => {
      expect(retry(1, "infrastructure", true)).toEqual({
        decision: "retry",
        modelCall: "retry",
        nextAttemptNumber: 2,
        backoffMs: 60_000,
      });
      expect(retry(2, "infrastructure", true)).toEqual({
        decision: "retry",
        modelCall: "retry",
        nextAttemptNumber: 3,
        backoffMs: 300_000,
      });
      expect(retry(1, "infrastructure", false)).toEqual({
        decision: "terminal",
        modelCall: "none",
        nextAttemptNumber: null,
        backoffMs: null,
        reason: "infrastructure_not_retryable",
      });
    });

    it.each([
      "domain",
      "schema",
      "editorial",
      "model_refusal",
    ] as const)(
      "makes %s failures terminal even when a caller marks them retryable",
      (category) => {
        expect(retry(1, category, true)).toEqual({
          decision: "terminal",
          modelCall: "none",
          nextAttemptNumber: null,
          backoffMs: null,
          reason: "failure_is_terminal",
        });
      },
    );

    it("stops at the total model-call cap", () => {
      expect(
        retry(
          READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS,
          "infrastructure",
          true,
        ),
      ).toEqual({
        decision: "terminal",
        modelCall: "none",
        nextAttemptNumber: null,
        backoffMs: null,
        reason: "attempt_limit_reached",
      });
      expect(() =>
        retry(
          READER_SUMMARY_WEEKLY_MAX_MODEL_ATTEMPTS + 1,
          "infrastructure",
          true,
        ),
      ).toThrow("attempt number is outside the hard bound");
    });

    it("is deterministic, immutable and fails closed on malformed input", () => {
      const first = retry(1, "infrastructure", true);
      const replay = retry(1, "infrastructure", true);

      expect(replay).toEqual(first);
      expect(Object.isFrozen(first)).toBe(true);
      expect(() =>
        decideReaderSummaryWeeklyRetry({
          attemptNumber: 1,
          failure: {
            category: "provider_guess" as never,
            retryable: true,
          },
        }),
      ).toThrow("failure classification is invalid");
      expect(() =>
        decideReaderSummaryWeeklyRetry({
          attemptNumber: 1,
          failure: {
            category: "infrastructure",
            retryable: "yes" as never,
          },
        }),
      ).toThrow("retryability classification is invalid");
    });
  });
});
