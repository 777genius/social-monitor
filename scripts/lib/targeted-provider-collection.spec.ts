import { runTargetedProviderCollection } from "./targeted-provider-collection";

type Result = {
  readonly provider: string;
  readonly disposition: "none" | "immediate" | "deferred";
  readonly accepted?: number;
};

describe("runTargetedProviderCollection", () => {
  it("retries only the provider that missed its SLO", async () => {
    const calls: string[] = [];
    const outcomes = await runTargetedProviderCollection({
      targets: ["reddit", "rss", "x-twitter"],
      retryBudget: 1,
      async collect(provider, attemptNumber): Promise<Result> {
        calls.push(`${provider}:${attemptNumber}`);
        return {
          provider,
          disposition:
            provider === "reddit" && attemptNumber === 1
              ? "immediate"
              : provider === "x-twitter"
                ? "deferred"
                : "none",
        };
      },
      retryDisposition: (result) => result.disposition,
    });

    expect(calls).toEqual(["reddit:1", "rss:1", "x-twitter:1", "reddit:2"]);
    expect(outcomes.map((outcome) => outcome.attempts.length)).toEqual([
      2, 1, 1,
    ]);
  });

  it("stops after the bounded retry budget", async () => {
    let calls = 0;
    await runTargetedProviderCollection({
      targets: ["reddit"],
      retryBudget: 2,
      async collect(provider): Promise<Result> {
        calls += 1;
        return { provider, disposition: "immediate" };
      },
      retryDisposition: (result) => result.disposition,
    });

    expect(calls).toBe(3);
  });

  it("lets callers keep a useful result when a later retry is rate limited", async () => {
    const outcomes = await runTargetedProviderCollection({
      targets: ["x-twitter"],
      retryBudget: 2,
      async collect(provider, attemptNumber): Promise<Result> {
        return attemptNumber === 1
          ? { provider, disposition: "immediate", accepted: 17 }
          : { provider, disposition: "deferred", accepted: 0 };
      },
      retryDisposition: (result) => result.disposition,
      selectPreferredResult: (current, candidate) =>
        (candidate.accepted ?? 0) > (current.accepted ?? 0)
          ? candidate
          : current,
    });

    expect(outcomes[0]?.attempts).toHaveLength(2);
    expect(outcomes[0]?.result).toEqual({
      provider: "x-twitter",
      disposition: "immediate",
      accepted: 17,
    });
  });

  it("lets callers retain a better result after a failed immediate retry", async () => {
    const outcomes = await runTargetedProviderCollection({
      targets: ["x-twitter"],
      retryBudget: 1,
      async collect(provider, attemptNumber): Promise<Result> {
        return attemptNumber === 1
          ? { provider, disposition: "immediate", accepted: 17 }
          : { provider, disposition: "immediate", accepted: 0 };
      },
      retryDisposition: (result) => result.disposition,
      selectPreferredResult: (current, candidate) =>
        (candidate.accepted ?? 0) > (current.accepted ?? 0)
          ? candidate
          : current,
    });

    expect(outcomes[0]?.attempts).toHaveLength(2);
    expect(outcomes[0]?.result.accepted).toBe(17);
  });

  it("replaces a retryable result when the retry meets its SLO", async () => {
    const outcomes = await runTargetedProviderCollection({
      targets: ["reddit"],
      retryBudget: 1,
      async collect(provider, attemptNumber): Promise<Result> {
        return {
          provider,
          disposition: attemptNumber === 1 ? "immediate" : "none",
          accepted: attemptNumber === 1 ? 10 : 25,
        };
      },
      retryDisposition: (result) => result.disposition,
    });

    expect(outcomes[0]?.result).toEqual({
      provider: "reddit",
      disposition: "none",
      accepted: 25,
    });
  });
});
