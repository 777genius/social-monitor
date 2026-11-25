import { createHash } from "node:crypto";
// Sorted semantic keys, exact decimal strings, explicit absence. No protobuf bytes.
export function xCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(xCanonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null && Object.prototype.toString.call(value) === "[object Object]" &&
      Object.getPrototypeOf(value) !== null && Object.getPrototypeOf(Object.getPrototypeOf(value)) === null && Object.getOwnPropertySymbols(value).length === 0) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${xCanonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("Invalid X semantic value");
}
export const xSemanticDigest = (value: unknown): string => createHash("sha256").update(xCanonicalJson(value), "utf8").digest("hex");
