import { isSchemaNode as isNode, type SchemaNode } from "./gateway-llm-schema-primitives";
import { withExplicitType, withoutTypeList } from "./gateway-llm-schema-type-policy";

const schemaMaps = ["properties", "$defs", "definitions"] as const;
const schemaLists = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
const schemaSingles = ["items", "additionalProperties", "not"] as const;

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

