type SchemaNode = Record<string, unknown>;

/** Only node-level provider prompt limits; the collector owns schema graph walking. */
type SchemaPromptLimitSink = {
  readonly lines: Set<string>;
  readonly empty: Set<string>;
};

/**
 * Share of a schema maxLength the prompt asks for. Models count characters
 * loosely, and Kimi does not reliably enforce maxLength itself, so the
 * prompt keeps about 15% headroom below the limit the decode checks.
 */
export const promptLengthShare = 0.85;
/** Copied identifiers and URLs: their limits are not something to write towards. */
const copiedValue = /(?:Id|Ids|Key|Keys|Url|Urls)$/u;

/**
 * Project only one schema node's limits. Undefined means an always-empty array
 * terminates child traversal; true admits recursion into array items.
 * The graph collector retains ordered set deduplication and refs admission.
 */
export const projectGatewaySchemaPromptNodeConstraints = (
  ctx: SchemaPromptLimitSink,
  node: SchemaNode,
  path: string,
): boolean | undefined => {
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
    return true;
  }
  return false;
};

const typesOf = (node: SchemaNode): readonly unknown[] =>
  node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
