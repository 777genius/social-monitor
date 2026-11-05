import { createHash } from "node:crypto";

export const sameOrderedStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const readerPostPromotionDigest = (canonicalPayload: string): string =>
  createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
