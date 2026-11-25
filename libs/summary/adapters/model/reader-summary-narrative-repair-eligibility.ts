export const isRepairableNarrativeError = (error: unknown): boolean =>
  error instanceof Error && ["Reader summary narrative", "Daily editorial narrative",
    "Daily editorial story", "Daily editorial stories", "Daily editorial synthesis"].some(prefix => error.message.startsWith(prefix));
