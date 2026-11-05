type SchemaNode = Record<string, unknown>;

/**
 * Share of a schema maxLength the prompt asks for. Models count characters
 * loosely, and Kimi does not reliably enforce maxLength itself, so the
 * prompt keeps about 15% headroom below the limit the decode checks.
 */
export const promptLengthShare = 0.85;
/** Copied identifiers and URLs: their limits are not something to write towards. */
const copiedValue = /(?:Id|Ids|Key|Keys|Url|Urls)$/u;

/**
 * A "Hard limits" prompt block derived from an output schema: every prose
 * maxLength (with headroom), every item count, and the arrays that must stay
 * empty. Paths use [] for "every item".
 */
export const gatewayOutputHardLimits = (schema: SchemaNode): string => {
  const lines = new Set<string>();
  const empty = new Set<string>();
  walk({ root: schema, lines, empty, refs: [] }, schema, "$");
  return [
    "Hard limits. They override any longer length guidance above, and the response is rejected when any of them is exceeded. Stay inside them by writing complete, shorter sentences; never cut a sentence or word to fit.",
    ...lines,
    ...(empty.size === 0 ? [] : [`- always empty arrays: ${[...empty].join(", ")}`]),
  ].join("\n");
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
  const name = path.replace(/\[\]$/u, "").split(".").at(-1) ?? "";
  if (typesOf(node).includes("string") && count(node.maxLength) && !copiedValue.test(name)) {
    ctx.lines.add(`- ${path}: at most ${Math.floor(node.maxLength * promptLengthShare)} characters`);
  }
  // Kimi never enforces number ranges, so they are spelled out exactly.
  if (typesOf(node).some((type) => type === "number" || type === "integer") &&
      (finite(node.minimum) || finite(node.maximum))) {
    ctx.lines.add(`- ${path}: ${finite(node.minimum) && finite(node.maximum)
      ? `a number from ${node.minimum} to ${node.maximum}`
      : finite(node.minimum) ? `a number of at least ${node.minimum}` : `a number of at most ${node.maximum}`}`);
  }
  if (typesOf(node).includes("array")) {
    if (node.maxItems === 0) {
      ctx.empty.add(path);
      return;
    }
    const min = count(node.minItems) && node.minItems > 0 ? node.minItems : undefined;
    if (count(node.maxItems)) {
      ctx.lines.add(`- ${path}: ${min === undefined ? "at most" : `${min} to`} ${node.maxItems} items`);
    } else if (min !== undefined) {
      ctx.lines.add(`- ${path}: at least ${min} items`);
    }
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

const typesOf = (node: SchemaNode): readonly unknown[] =>
  node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];

const isNode = (value: unknown): value is SchemaNode =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
