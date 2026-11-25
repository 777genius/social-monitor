import { isSchemaNode as isNode, schemaJsonType as jsonType, type SchemaNode } from "./gateway-llm-schema-primitives";

/** Schema-only checks. No repair text, provider output logging or gateway transport. */
export const resolveOutputSchemaReference = (root: SchemaNode, ref: string): SchemaNode | undefined => {
  const match = /^#\/(\$defs|definitions)\/(.+)$/u.exec(ref);
  const defs = match === null ? undefined : root[match[1]!];
  const target = isNode(defs) ? defs[match![2]!.replaceAll("~1", "/").replaceAll("~0", "~")] : undefined;
  return isNode(target) ? target : undefined;
};

export const outputSchemaAllowsValueType = (node: SchemaNode, value: unknown): boolean => {
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

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

type ConstraintResult = {
  readonly violations: readonly string[];
  /** An invalid type, enum or const excludes all deeper schema interpretation. */
  readonly canVisitChildren: boolean;
};

/** Enumerate only schema keywords and numeric limits, never untrusted output text. */
export const explainOutputNodeConstraints = (
  node: SchemaNode,
  value: unknown,
  path: string,
): ConstraintResult => {
  if (!outputSchemaAllowsValueType(node, value)) {
    return { violations: [`${path}:type`], canVisitChildren: false };
  }
  if (Array.isArray(node.enum) && !node.enum.some((entry) => canonical(entry) === canonical(value))) {
    return { violations: [`${path}:enum`], canVisitChildren: false };
  }
  if (Object.hasOwn(node, "const") && canonical(node.const) !== canonical(value)) {
    return { violations: [`${path}:const`], canVisitChildren: false };
  }
  const violations: string[] = [];
  if (typeof value === "string") {
    const length = Array.from(value).length;
    if (count(node.maxLength) && length > node.maxLength) violations.push(`${path}:maxLength=${node.maxLength}`);
    if (count(node.minLength) && length < node.minLength) violations.push(`${path}:minLength=${node.minLength}`);
  }
  if (typeof value === "number") {
    if (finite(node.maximum) && value > node.maximum) violations.push(`${path}:maximum=${node.maximum}`);
    if (finite(node.minimum) && value < node.minimum) violations.push(`${path}:minimum=${node.minimum}`);
  }
  if (Array.isArray(value)) {
    if (count(node.maxItems) && value.length > node.maxItems) violations.push(`${path}:maxItems=${node.maxItems}`);
    if (count(node.minItems) && value.length < node.minItems) violations.push(`${path}:minItems=${node.minItems}`);
  }
  return { violations, canVisitChildren: true };
};
