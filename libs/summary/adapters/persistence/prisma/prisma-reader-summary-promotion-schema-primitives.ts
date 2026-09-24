export const invalid = (key: string): never => {
  throw new Error(`Invalid promotion field: ${key}`);
};
export const exactKeys = (value: Record<string, unknown>,
  required: readonly string[], optional: readonly string[], label: string): void => {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key)) ||
      Object.values(value).some((nested) => nested === null || nested === undefined)) {
    throw new Error(`${label} must match the exact schema`);
  }
};
export const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};
export const requireArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};
export const strings = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (typeof value[key] !== "string" ||
    (value[key] as string).trim() === "") invalid(key);
};
export const numbers = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (typeof value[key] !== "number" ||
    !Number.isFinite(value[key])) invalid(key);
};
export const booleans = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if (typeof value[key] !== "boolean") invalid(key);
};
export const units = (value: Record<string, unknown>, keys: readonly string[]): void => {
  for (const key of keys) if ((value[key] as number) < 0 ||
    (value[key] as number) > 1) invalid(key);
};
export const nonNegativeInteger = (value: unknown, key: string): void => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(key);
};
export const exactValue = (value: unknown, expected: unknown, key: string): void => {
  if (value !== expected) invalid(key);
};
export const oneOf = (value: unknown, allowed: readonly unknown[], key: string): void => {
  if (!allowed.includes(value)) invalid(key);
};
export const dates = (value: Record<string, unknown>, required: readonly string[],
  optional: readonly string[]): void => {
  for (const key of [...required, ...optional]) {
    if (optional.includes(key) && value[key] === undefined) continue;
    const candidate = value[key];
    const date = candidate instanceof Date ? candidate : typeof candidate === "string"
      ? new Date(candidate) : null;
    if (date === null || !Number.isFinite(date.getTime())) invalid(key);
  }
};
export const stringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" ||
      item.trim() === "")) invalid(label);
  return value as string[];
};
export const nonEmptyUniqueStringArray = (value: unknown, label: string): string[] => {
  const items = stringArray(value, label);
  if (items.length === 0 || new Set(items).size !== items.length) invalid(label);
  return items;
};
export const sameOrdered = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
