export function dailySourceAuthority(historicalIncomplete = false, mimo = false) {
  return {
    canonicalSha256: "7".repeat(64),
    modelJobIdentity: "8".repeat(64),
    receiptSha256: "9".repeat(64),
    modelExecution: historicalIncomplete ? {
      provider: "codex",
      model: mimo ? "mimo-v2.6-pro" : "gpt-5.6-sol",
      reasoningEffort: "high",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: "HISTORICAL_INCOMPLETE",
      durationMs: null,
    } : {
      provider: "codex",
      model: mimo ? "mimo-v2.6-pro" : "gpt-5.6-sol",
      reasoningEffort: "high",
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      usageSource: "PROVIDER_REPORTED",
      durationMs: 250,
    },
  };
}
