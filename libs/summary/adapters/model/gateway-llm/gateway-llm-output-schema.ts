import type { SchemaNode } from "./gateway-llm-schema-primitives";
import { withExplicitType, withoutTypeList } from "./gateway-llm-schema-type-policy";
import { mapGatewaySchemaTree } from "./gateway-llm-schema-traversal";

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
export const toGatewayOutputSchema = (schema: SchemaNode): SchemaNode =>
  mapGatewaySchemaTree(schema, (node) => withoutTypeList(withExplicitType(node)));
