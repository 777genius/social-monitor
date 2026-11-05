type SchemaNode = Record<string, unknown>;

export const maxReportedOutputViolations = 12;
const maxDepth = 64;
/** path:keyword or path:keyword=limit, built from schema names and indices only. */
export const safeOutputViolationPattern = /^\$[A-Za-z0-9_.[\]]{0,160}:[A-Za-z_]{1,32}(?:=\d{1,7})?$/u;

/**
 * Every place a decoded value breaks the gateway output schema, so a repair
 * prompt can name all of them at once. Paths are built from schema property
 * names and array indices; a key the model invented is reported without its
 * name, so no output text reaches feedback or failure reasons. Acceptance
 * stays with the strict decode; this only explains a rejection.
 */
export const collectOutputViolations = (
  schema: SchemaNode, value: unknown, limit = maxReportedOutputViolations,
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
    const target = resolve(ctx.root, node.$ref);
    if (target !== undefined) visit(ctx, target, value, path, depth + 1);
    return;
  }
  const branches = Array.isArray(node.anyOf) ? node.anyOf : Array.isArray(node.oneOf) ? node.oneOf : undefined;
  if (branches !== undefined) {
    const schemas = branches.filter(isNode);
    if (schemas.some((branch) => accepts(ctx.root, branch, value, depth))) return;
    // Explain inside the one branch of the value's type, e.g. a too long nullable string.
    const typed = schemas.filter((branch) => typeAllows(branch, value));
    if (typed.length === 1) visit(ctx, typed[0]!, value, path, depth + 1);
    else report(`${path}:anyOf`);
    return;
  }
  if (!typeAllows(node, value)) return report(`${path}:type`);
  if (Array.isArray(node.enum) && !node.enum.some((entry) => canonical(entry) === canonical(value))) {
    return report(`${path}:enum`);
  }
  if (Object.hasOwn(node, "const") && canonical(node.const) !== canonical(value)) return report(`${path}:const`);
  if (typeof value === "string") {
    const length = Array.from(value).length;
    if (count(node.maxLength) && length > node.maxLength) report(`${path}:maxLength=${node.maxLength}`);
    if (count(node.minLength) && length < node.minLength) report(`${path}:minLength=${node.minLength}`);
  }
  if (typeof value === "number") {
    if (finite(node.maximum) && value > node.maximum) report(`${path}:maximum=${node.maximum}`);
    if (finite(node.minimum) && value < node.minimum) report(`${path}:minimum=${node.minimum}`);
  }
  if (Array.isArray(value)) {
    if (count(node.maxItems) && value.length > node.maxItems) report(`${path}:maxItems=${node.maxItems}`);
    if (count(node.minItems) && value.length < node.minItems) report(`${path}:minItems=${node.minItems}`);
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

const resolve = (root: SchemaNode, ref: string): SchemaNode | undefined => {
  const match = /^#\/(\$defs|definitions)\/(.+)$/u.exec(ref);
  const defs = match === null ? undefined : root[match[1]!];
  const target = isNode(defs) ? defs[match![2]!.replaceAll("~1", "/").replaceAll("~0", "~")] : undefined;
  return isNode(target) ? target : undefined;
};

const typeAllows = (node: SchemaNode, value: unknown): boolean => {
  const types = node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];
  const kind = jsonType(value);
  return types.length === 0 || types.includes(kind) || (kind === "integer" && types.includes("number"));
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isNode(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const isNode = (value: unknown): value is SchemaNode =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const jsonType = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};
