import { projectGatewaySchemaPromptNodeConstraints } from "./gateway-llm-schema-prompt-constraint-policy";
export { promptLengthShare } from "./gateway-llm-schema-prompt-constraint-policy";

type SchemaNode = Record<string, unknown>;


/** Interpret a bounded provider response schema without owning the prompt copy. */
export const collectGatewaySchemaLimits = (schema: SchemaNode): {
  readonly lines: readonly string[];
  readonly empty: readonly string[];
} => {
  const lines = new Set<string>();
  const empty = new Set<string>();
  walk({ root: schema, lines, empty, refs: [] }, schema, "$");
  return { lines: [...lines], empty: [...empty] };
};

type Context = {
  readonly root: SchemaNode;
  readonly lines: Set<string>;
  readonly empty: Set<string>;
  readonly refs: readonly string[];
};

const walk = (ctx: Context, node: SchemaNode, path: string): void => {
  if (typeof node.$ref === "string") {
    if (ctx.refs.includes(node.$ref) || ctx.refs.length > 16) return;
    const target = resolve(ctx.root, node.$ref);
    if (target !== undefined) walk({ ...ctx, refs: [...ctx.refs, node.$ref] }, target, path);
    return;
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = node[key];
    if (Array.isArray(branches)) for (const branch of branches) if (isNode(branch)) walk(ctx, branch, path);
  }
  const visitArrayItems = projectGatewaySchemaPromptNodeConstraints(ctx, node, path);
  if (visitArrayItems === undefined) return;
  if (visitArrayItems) {
    if (isNode(node.items)) walk(ctx, node.items, `${path}[]`);
  }
  if (isNode(node.properties)) {
    for (const [key, child] of Object.entries(node.properties)) {
      if (isNode(child)) walk(ctx, child, `${path}.${key}`);
    }
  }
};

const resolve = (root: SchemaNode, ref: string): SchemaNode | undefined => {
  const match = /^#\/(\$defs|definitions)\/(.+)$/u.exec(ref);
  const defs = match === null ? undefined : root[match[1]!];
  const target = isNode(defs) ? defs[match![2]!] : undefined;
  return isNode(target) ? target : undefined;
};

const isNode = (value: unknown): value is SchemaNode =>
  value !== null && typeof value === "object" && !Array.isArray(value);
