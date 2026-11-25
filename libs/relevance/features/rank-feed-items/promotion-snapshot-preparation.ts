import type { RankedFeedItemView } from "./rank-feed-items.result";

/** Dates become ISO values: freezing a Date does not prevent setTime(). */
export type PreparationValue<T> = T extends Date ? string
  : T extends readonly (infer Item)[] ? readonly PreparationValue<Item>[]
  : T extends object ? { readonly [Key in keyof T]: PreparationValue<T[Key]> }
  : T;

export type PromotionSnapshotPreparation = {
  /** Complete mapped partitions in repository order; rank is still zero here. */
  readonly primary: readonly RankedFeedItemView[];
  readonly supplemental: readonly RankedFeedItemView[];
  /** Eligibility requests, not a claim that all requests were attempted/resolved. */
  readonly requestedCandidateIds: readonly string[];
};

export type PromotionSnapshotPreparationObserver = (
  preparation: PreparationValue<PromotionSnapshotPreparation>,
) => void;

/** Only detached, frozen value projections cross the preparation boundary. */
export const preparationValue = <T>(value: T): PreparationValue<T> => {
  const project = (entry: unknown): unknown => {
    if (entry instanceof Date) return entry.toISOString();
    if (Array.isArray(entry)) return Object.freeze(entry.map(project));
    if (entry !== null && typeof entry === "object") {
      return Object.freeze(Object.fromEntries(
        Object.entries(entry).map(([key, child]) => [key, project(child)]),
      ));
    }
    return entry;
  };
  return project(value) as PreparationValue<T>;
};

/** Synchronous observation only. Capture owners must retain their own failures;
 * absence of a callback result is never evidence of successful capture. */
export const observePromotionSnapshotPreparation = (
  observer: PromotionSnapshotPreparationObserver,
  preparation: PromotionSnapshotPreparation,
): void => {
  try {
    observer(preparationValue(preparation));
  } catch {
    // Observation must not change ranking, retry assessment, or select evidence.
  }
};
