import { isSchemaNode as isNode, type SchemaNode } from "./gateway-llm-schema-primitives";
import {
  explainOutputNodeConstraints,
  outputSchemaAllowsValueType,
  resolveOutputSchemaReference,
} from "./gateway-llm-output-node-constraints";

/** Bounded recursive schema walk; never incorporates untrusted output text into diagnostics. */
const maxDepth = 64;

export const inspectOutputSchemaViolations = (
  schema: SchemaNode,
  value: unknown,
  limit: number,
): readonly string[] => {
  const found: string[] = [];
  visit({ root: schema, found, limit }, schema, value, "$", 0);
  return found;
};

type Context = { readonly root: SchemaNode; readonly found: string[]; readonly limit: number };

const visit = (ctx: Context, node: SchemaNode, value: unknown, path: string, depth: number): void => {
  const report = (violation: string): void => {
    if (ctx.found.length < ctx.limit && !ctx.found.includes(violation)) ctx.found.push(violation);
  };
  if (ctx.found.length >= ctx.limit || depth > maxDepth) return;
  if (typeof node.$ref === "string") {
    const target = resolveOutputSchemaReference(ctx.root, node.$ref);
    if (target !== undefined) visit(ctx, target, value, path, depth + 1);
    return;
  }
  const branches = Array.isArray(node.anyOf) ? node.anyOf : Array.isArray(node.oneOf) ? node.oneOf : undefined;
  if (branches !== undefined) {
    const schemas = branches.filter(isNode);
    if (schemas.some((branch) => accepts(ctx.root, branch, value, depth))) return;
    // Explain inside the one branch of the value's type, e.g. a too long nullable string.
    const typed = schemas.filter((branch) => outputSchemaAllowsValueType(branch, value));
    if (typed.length === 1) visit(ctx, typed[0]!, value, path, depth + 1);
    else report(`${path}:anyOf`);
    return;
  }
  const check = explainOutputNodeConstraints(node, value, path);
  for (const violation of check.violations) report(violation);
  if (!check.canVisitChildren) return;
  if (Array.isArray(value)) {
    if (isNode(node.items)) {
      const items = node.items;
      value.forEach((item, index) => visit(ctx, items, item, `${path}[${index}]`, depth + 1));
    }
  }
  if (isNode(value) && isNode(node.properties)) {
    const properties = node.properties;
    const required = Array.isArray(node.required) ? node.required.filter((key) => typeof key === "string") : [];
    for (const key of required) if (!Object.hasOwn(value, key)) report(`${path}.${key}:required`);
    for (const [key, item] of Object.entries(value)) {
      const property = Object.hasOwn(properties, key) ? properties[key] : undefined;
      if (!isNode(property)) {
        if (node.additionalProperties === false) report(`${path}:additionalProperties`);
        continue;
      }
      // Strict mode sends optional properties as nullable; null there means absent.
      if (item === null && !required.includes(key)) continue;
      visit(ctx, property, item, `${path}.${key}`, depth + 1);
    }
  }
};

const accepts = (root: SchemaNode, node: SchemaNode, value: unknown, depth: number): boolean => {
  const found: string[] = [];
  visit({ root, found, limit: 1 }, node, value, "$", depth + 1);
  return found.length === 0;
};
