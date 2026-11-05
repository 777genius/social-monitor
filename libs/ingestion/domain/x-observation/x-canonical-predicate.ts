export type XReceiptPredicatePolicy = Readonly<{ searchQuery: string; requireQueryMatch: boolean;
  minLikes?: number; minReposts?: number; minReplies?: number }>;

function policyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("INGESTION_POLICY_INVALID");
  }
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !key || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("INGESTION_POLICY_INVALID");
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

export function snapshotXReceiptPredicate(value: unknown): XReceiptPredicatePolicy {
  const leaf = policyRecord(value);
  if (typeof leaf.searchQuery !== "string" || !leaf.searchQuery.trim() ||
      typeof leaf.requireQueryMatch !== "boolean" || Object.keys(leaf).some((key) =>
        !["searchQuery", "requireQueryMatch", "minLikes", "minReposts", "minReplies"].includes(key)) ||
      ["minLikes", "minReposts", "minReplies"].some((key) => key in leaf &&
        (typeof leaf[key] !== "number" || !Number.isSafeInteger(leaf[key]) || (leaf[key] as number) < 0 || Object.is(leaf[key], -0)))) {
    throw new Error("INGESTION_POLICY_INVALID");
  }
  return Object.freeze({ ...leaf }) as XReceiptPredicatePolicy;
}
