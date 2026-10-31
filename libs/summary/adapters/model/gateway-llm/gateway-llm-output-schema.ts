type SchemaNode = Record<string, unknown>;

const schemaMaps = ["properties", "$defs", "definitions"] as const;
const schemaLists = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
const schemaSingles = ["items", "additionalProperties", "not"] as const;

/**
 * Kimi accepts only a "moonshot flavored" json_schema: a node without a type,
 * such as a bare string enum, is answered with HTTP 400 "type is not defined",
 * which the gateway reports as effect_unknown. Spelling out the type its enum
 * or const values already imply accepts exactly the same values, so the
 * product schema and its strict decode keep their meaning on every profile.
 */
export const withExplicitValueTypes = (schema: SchemaNode): SchemaNode => typed(schema);

const typed = (node: SchemaNode): SchemaNode => {
  const result: SchemaNode = { ...node };
  for (const key of schemaMaps) {
    const map = result[key];
    if (isNode(map)) {
      result[key] = Object.fromEntries(Object.entries(map).map(([name, child]) =>
        [name, isNode(child) ? typed(child) : child]));
    }
  }
  for (const key of schemaLists) {
    const list = result[key];
    if (Array.isArray(list)) result[key] = list.map((child) => isNode(child) ? typed(child) : child);
  }
  for (const key of schemaSingles) {
    const child = result[key];
    if (isNode(child)) result[key] = typed(child);
  }
  if (result.type !== undefined) return result;
  const values = Array.isArray(result.enum) ? result.enum
    : Object.hasOwn(result, "const") ? [result.const] : [];
  if (values.length === 0) return result;
  let types = [...new Set(values.map(jsonType))];
  if (types.includes("number")) types = types.filter((type) => type !== "integer");
  return { ...result, type: types.length === 1 ? types[0] : types };
};

const isNode = (value: unknown): value is SchemaNode =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const jsonType = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};
