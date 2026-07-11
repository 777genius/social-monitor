import { runTargetedProviderCollection } from "./targeted-provider-collection";

type Result = {
  readonly provider: string;
  readonly disposition: "none" | "immediate" | "deferred";
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
});
