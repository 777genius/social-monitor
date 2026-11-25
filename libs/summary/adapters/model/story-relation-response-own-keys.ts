// Zod 4 skips own __proto__ keys. Inspect the two known wire object
// boundaries against their schema properties; Zod owns every other constraint.
export const rawOwnKeyIssues = (raw: unknown, schema: Record<string, unknown>) => {
  const issues: { code: "unrecognized_keys"; path: (string | number)[]; keys: string[] }[] = [];
  const inspect = (value: unknown, objectSchema: Record<string, unknown>, path: (string | number)[]) => {
    if (!isRecord(value) || objectSchema.additionalProperties !== false) return;
    const properties = objectSchema.properties;
    if (!isRecord(properties)) return;
    const keys = Object.keys(value).filter((key) => !Object.hasOwn(properties, key));
    if (keys.length) issues.push({ code: "unrecognized_keys", path, keys });
  };
  inspect(raw, schema, []);
  const properties = schema.properties;
  if (isRecord(raw) && Array.isArray(raw.decisions) && isRecord(properties) &&
      Object.hasOwn(properties, "decisions")) {
    const decisionsSchema = properties.decisions;
    if (isRecord(decisionsSchema) && isRecord(decisionsSchema.items)) {
      const itemSchema = decisionsSchema.items;
      raw.decisions.forEach((decision, index) => inspect(decision, itemSchema, ["decisions", index]));
    }
  }
  return issues;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
