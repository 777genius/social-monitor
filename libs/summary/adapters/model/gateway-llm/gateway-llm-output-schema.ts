type SchemaNode = Record<string, unknown>;

const schemaMaps = ["properties", "$defs", "definitions"] as const;
const schemaLists = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
const schemaSingles = ["items", "additionalProperties", "not"] as const;

/** Keywords that constrain only values of one JSON type. */
const numberKeywords = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
const keywordsByType: Readonly<Record<string, readonly string[]>> = {
  string: ["minLength", "maxLength", "pattern", "format"],
  number: numberKeywords,
  integer: numberKeywords,
  array: ["items", "prefixItems", "minItems", "maxItems", "uniqueItems"],
  object: ["properties", "required", "additionalProperties"],
};
const typeSpecificKeywords = new Set(Object.values(keywordsByType).flat());

/**
 * Rewrites a product schema into the "moonshot flavored" form Kimi enforces,
 * without changing which values it accepts:
 *
 * - A node without a type, such as a bare string enum, is answered with HTTP
 *   400 "type is not defined", so the type its enum or const values already
 *   imply is spelled out.
 * - A type list such as ["string", "null"] is accepted, but then Kimi stops
 *   enforcing the whole schema (lengths, item counts, enums, required fields)
 *   and the strict decode rejects whatever the model wrote. Each listed type
 *   becomes its own anyOf branch with only the keywords of that type, which
 *   Kimi does enforce.
 *
 * Kimi also ignores minimum and maximum; the strict decode still checks them.
 */
export const toGatewayOutputSchema = (schema: SchemaNode): SchemaNode => normalized(schema);

const normalized = (node: SchemaNode): SchemaNode => {
  const result: SchemaNode = { ...node };
  for (const key of schemaMaps) {
    const map = result[key];
    if (isNode(map)) {
      result[key] = Object.fromEntries(Object.entries(map).map(([name, child]) =>
        [name, isNode(child) ? normalized(child) : child]));
    }
  }
  for (const key of schemaLists) {
    const list = result[key];
    if (Array.isArray(list)) result[key] = list.map((child) => isNode(child) ? normalized(child) : child);
  }
  for (const key of schemaSingles) {
    const child = result[key];
    if (isNode(child)) result[key] = normalized(child);
  }
  return withoutTypeList(withExplicitType(result));
};

const withExplicitType = (node: SchemaNode): SchemaNode => {
  if (node.type !== undefined) return node;
  const values = Array.isArray(node.enum) ? node.enum
    : Object.hasOwn(node, "const") ? [node.const] : [];
  if (values.length === 0) return node;
  let types = [...new Set(values.map(jsonType))];
  if (types.includes("number")) types = types.filter((type) => type !== "integer");
  return { ...node, type: types.length === 1 ? types[0] : types };
};

const withoutTypeList = (node: SchemaNode): SchemaNode => {
  if (!Array.isArray(node.type)) return node;
  const types = node.type.filter((type): type is string => typeof type === "string");
  if (types.length === 1) return { ...node, type: types[0] };
  // An existing composition cannot take the branches without changing meaning.
  if (types.length !== node.type.length || node.anyOf !== undefined || node.oneOf !== undefined ||
      node.allOf !== undefined) {
    return node;
  }
  const wrapper: SchemaNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (key !== "type" && key !== "enum" && key !== "const" && !typeSpecificKeywords.has(key)) {
      wrapper[key] = value;
    }
  }
  const branches = types.flatMap((type) => {
    const branch: SchemaNode = { type };
    for (const key of keywordsByType[type] ?? []) {
      if (node[key] !== undefined) branch[key] = node[key];
    }
    // The null type already admits exactly one value.
    if (type === "null") {
      return (Array.isArray(node.enum) && !node.enum.includes(null)) ||
        (Object.hasOwn(node, "const") && node.const !== null) ? [] : [branch];
    }
    if (Array.isArray(node.enum)) {
      const allowed = node.enum.filter((value) => matchesType(value, type));
      if (allowed.length === 0) return [];
      branch.enum = allowed;
    }
    if (Object.hasOwn(node, "const")) {
      if (!matchesType(node.const, type)) return [];
      branch.const = node.const;
    }
    return [branch];
  });
  return { ...wrapper, anyOf: branches };
};

const matchesType = (value: unknown, type: string): boolean => {
  const actual = jsonType(value);
  return actual === type || (type === "number" && actual === "integer");
};

const isNode = (value: unknown): value is SchemaNode =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const jsonType = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};
