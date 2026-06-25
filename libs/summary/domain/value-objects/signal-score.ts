export type SignalScore = number;

export const normalizeSignalScore = (value: number): SignalScore =>
  Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : 0;

export const clampConfidenceScore = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
