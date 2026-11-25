import { schemaJsonType as jsonType, type SchemaNode } from "./gateway-llm-schema-primitives";

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

export const withExplicitType = (node: SchemaNode): SchemaNode => {
  if (node.type !== undefined) return node;
  const values = Array.isArray(node.enum) ? node.enum
    : Object.hasOwn(node, "const") ? [node.const] : [];
  if (values.length === 0) return node;
  let types = [...new Set(values.map(jsonType))];
  if (types.includes("number")) types = types.filter((type) => type !== "integer");
  return { ...node, type: types.length === 1 ? types[0] : types };
};

export const withoutTypeList = (node: SchemaNode): SchemaNode => {
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

