import { isSchemaNode as isNode, type SchemaNode } from "./gateway-llm-schema-primitives";

const schemaMaps = ["properties", "$defs", "definitions"] as const;
const schemaLists = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
const schemaSingles = ["items", "additionalProperties", "not"] as const;

/**
 * Structural post-order visitor. It knows the JSON Schema child shapes, not
 * provider-specific type rewrites; callers own any policy applied at each node.
 * Unrecognized keyword payloads remain opaque and inputs are never mutated.
 */
export const mapGatewaySchemaTree = (
  node: SchemaNode,
  rewrite: (node: SchemaNode) => SchemaNode,
): SchemaNode => {
  const result: SchemaNode = { ...node };
  for (const key of schemaMaps) {
    const map = result[key];
    if (isNode(map)) {
      result[key] = Object.fromEntries(Object.entries(map).map(([name, child]) =>
        [name, isNode(child) ? mapGatewaySchemaTree(child, rewrite) : child]));
    }
  }
  for (const key of schemaLists) {
    const list = result[key];
    if (Array.isArray(list)) result[key] = list.map((child) =>
      isNode(child) ? mapGatewaySchemaTree(child, rewrite) : child);
  }
  for (const key of schemaSingles) {
    const child = result[key];
    if (isNode(child)) result[key] = mapGatewaySchemaTree(child, rewrite);
  }
  return rewrite(result);
};
