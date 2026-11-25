export const hasExactKeys = <const Keys extends readonly string[]>(
  value: unknown,
  expected: Keys,
): value is Record<Keys[number], unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));

export const exactStringArray = (value: readonly unknown[], label: string): string[] => {
  const strings = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`${label} must contain only strings`);
    }
    return item;
  });
  if (strings.length === 0 || new Set(strings).size !== strings.length) {
    throw new Error(`${label} must be non-empty and unique`);
  }
  return strings;
};

export const assertFiniteDenseJson = (
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains a non-JSON value`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${path} contains a circular reference`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new Error(`${path} contains a non-dense array`);
      }
      assertFiniteDenseJson(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, child] of Object.entries(value)) {
      assertFiniteDenseJson(child, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
};
