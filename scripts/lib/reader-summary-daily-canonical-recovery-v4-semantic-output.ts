/**
 * V4 accepts the provider's selected `output_text` as a transient byte stream.
 * The provider attestation is checked against those bytes before this module is
 * entered. This module deliberately emits only canonical bytes; callers must
 * never persist the raw string that was selected by the provider.
 */
export const dailyCanonicalRecoveryOutputTextMaxBytes = 1_000_000;

const dailyOutputKeys = [
  "citationMap",
  "confidence",
  "content",
  "executiveSummary",
  "headline",
  "interestHighlights",
  "narrativeSections",
  "noSignalReason",
  "qualityFlags",
  "repeatedSignals",
  "risksAndUnknowns",
  "topStories",
] as const;

export type DailyCanonicalRecoveryOutputAdmission = Readonly<{
  canonicalBytes: Buffer;
  output: Readonly<Record<string, unknown>>;
}>;

/**
 * Parses exactly one JSON object with the fixed V4 top-level shape and returns
 * its canonical representation. Whitespace and member order are intentionally
 * not identity: the immutable provider attestation protects the raw selection
 * and the returned bytes protect the durable/public representation.
 */
export const parseStrictDailyOutputText = (outputText: string): Buffer =>
  parseDailyCanonicalRecoveryOutputText(Buffer.from(outputText, "utf8"))
    .canonicalBytes;

export const parseDailyCanonicalRecoveryOutputText = (
  rawOutputBytes: Buffer,
): DailyCanonicalRecoveryOutputAdmission => {
  const bytes = Buffer.from(rawOutputBytes);
  if (bytes.length === 0 || bytes.length > dailyCanonicalRecoveryOutputTextMaxBytes) {
    throw new Error("Daily canonical recovery output_text framing is invalid");
  }
  const outputText = bytes.toString("utf8");
  // A replacement character would make a different byte sequence appear valid
  // after JSON.parse. Reject it rather than normalizing malformed UTF-8.
  if (!Buffer.from(outputText, "utf8").equals(bytes)) {
    throw new Error("Daily canonical recovery output_text encoding is invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(outputText) as unknown;
  } catch {
    throw new Error("Daily canonical recovery output_text is not JSON");
  }
  assertNoDuplicateJsonObjectKeys(outputText);
  assertExactObject(value, dailyOutputKeys, "daily output");
  const output = value as Readonly<Record<string, unknown>>;
  if (
    typeof output.headline !== "string" ||
    typeof output.executiveSummary !== "string" ||
    !Array.isArray(output.narrativeSections) ||
    !isObject(output.content) ||
    !Array.isArray(output.topStories) ||
    !Array.isArray(output.interestHighlights) ||
    !Array.isArray(output.repeatedSignals) ||
    !Array.isArray(output.risksAndUnknowns) ||
    !Array.isArray(output.citationMap) ||
    !Array.isArray(output.qualityFlags) ||
    !isObject(output.confidence) ||
    !(output.noSignalReason === null || typeof output.noSignalReason === "string")
  ) {
    throw new Error("Daily canonical recovery output_text shape is invalid");
  }
  return Object.freeze({ canonicalBytes: canonicalJsonBytes(output), output });
};

/** Performs every non-attestation V4 admission predicate before persistence. */
export const assertDailyCanonicalRecoveryOutputSemanticValidity = (input: {
  readonly output: unknown;
  readonly sourceAuthorityBytes: Buffer;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly citationSelectionLimit: number;
}): void => {
  assertDailyOutputMatchesJsonSchema(input.output, input.schema);
  assertDailyOutputCitationsMatchSourceAuthority(
    input.output,
    input.sourceAuthorityBytes,
    input.citationSelectionLimit,
  );
  assertDailyOutputContentAndSignalValidity(input.output);
};

export const assertDailyOutputMatchesJsonSchema = (
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
): void => validateSchema(value, schema, schema, "output_text");

/**
 * cN is an ordinal into the frozen authority selection. Matching both source
 * identifiers and the provider key prevents a model from inventing citations.
 */
export const assertDailyOutputCitationsMatchSourceAuthority = (
  output: unknown,
  sourceAuthorityBytes: Buffer,
  selectionLimit: number,
): void => {
  let source: unknown;
  try {
    source = JSON.parse(sourceAuthorityBytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("Daily canonical recovery source authority is not JSON");
  }
  if (
    !isObject(source) ||
    !Array.isArray(source.items) ||
    !isObject(output) ||
    !Array.isArray(output.citationMap) ||
    !Number.isSafeInteger(selectionLimit) || selectionLimit < 1
  ) {
    throw new Error("Daily canonical recovery citation authority is invalid");
  }
  const seen = new Set<string>();
  for (const value of output.citationMap) {
    if (!isObject(value) || typeof value.citationId !== "string") {
      throw new Error("Daily canonical recovery citationMap is invalid");
    }
    const match = /^c([1-9][0-9]*)$/u.exec(value.citationId);
    const ordinal = match === null ? 0 : Number(match[1]);
    const item = ordinal <= Math.min(selectionLimit, source.items.length)
      ? source.items[ordinal - 1]
      : undefined;
    if (
      !isObject(item) ||
      seen.has(value.citationId) ||
      value.feedItemId !== item.feedItemId ||
      value.sourceItemId !== item.sourceItemId ||
      value.providerKey !== item.providerKey ||
      value.field !== "canonicalUrl" ||
      typeof item.title !== "string" || item.title.length === 0 ||
      typeof item.bodyPreview !== "string" ||
      typeof item.canonicalUrl !== "string" || item.canonicalUrl.length === 0 ||
      typeof item.contentHash !== "string" || !/^[0-9a-f]{64}$/u.test(item.contentHash)
    ) {
      throw new Error(
        "Daily canonical recovery citationMap diverges from frozen authority",
      );
    }
    seen.add(value.citationId);
  }
};

/**
 * Schema validation proves individual field shapes. These cross-field checks
 * make the semantic route closed: every referenced citation is sealed and the
 * no-signal declaration cannot conflict with public content.
 */
export const assertDailyOutputContentAndSignalValidity = (output: unknown): void => {
  if (!isObject(output) || !Array.isArray(output.citationMap)) {
    throw new Error("Daily canonical recovery output_text content is invalid");
  }
  const citationIds = new Set<string>();
  for (const citation of output.citationMap) {
    if (!isObject(citation) || typeof citation.citationId !== "string") {
      throw new Error("Daily canonical recovery output_text citations are invalid");
    }
    citationIds.add(citation.citationId);
  }
  assertClaimBearingCitationReferences(output, citationIds);
  visitCitationReferences(output, citationIds);
  const hasNoSignal = Array.isArray(output.qualityFlags) &&
    output.qualityFlags.includes("no_signal");
  const topStories = Array.isArray(output.topStories) ? output.topStories : undefined;
  if (topStories === undefined || hasNoSignal !== (topStories.length === 0)) {
    throw new Error("Daily canonical recovery output_text signal state is inconsistent");
  }
  if (
    (hasNoSignal && (typeof output.noSignalReason !== "string" ||
      output.noSignalReason.length === 0)) ||
    (!hasNoSignal && output.noSignalReason !== null)
  ) {
    throw new Error("Daily canonical recovery output_text no-signal reason is invalid");
  }
};

const assertClaimBearingCitationReferences = (
  output: Record<string, unknown>,
  citationIds: ReadonlySet<string>,
): void => {
  const claimCollections: readonly [string, unknown][] = [
    ["topStories", output.topStories],
    ["interestHighlights", output.interestHighlights],
    ["repeatedSignals", output.repeatedSignals],
  ];
  for (const [label, entries] of claimCollections) {
    if (!Array.isArray(entries)) {
      throw new Error(`Daily canonical recovery output_text ${label} is invalid`);
    }
    entries.forEach((entry, index) =>
      assertClaimCitationIds(entry, citationIds, `${label}[${index}]`));
  }
  if (!isObject(output.content) || !Array.isArray(output.content.claimBoard)) {
    throw new Error("Daily canonical recovery output_text content is invalid");
  }
  output.content.claimBoard.forEach((entry, index) =>
    assertClaimCitationIds(entry, citationIds, `readerClaim[${index}]`));
};

const assertClaimCitationIds = (
  value: unknown,
  citationIds: ReadonlySet<string>,
  label: string,
): void => {
  if (!isObject(value) || !Array.isArray(value.citationIds)) {
    throw new Error(`Daily canonical recovery output_text ${label} citations are invalid`);
  }
  if (value.citationIds.length === 0) {
    throw new Error(`Daily canonical recovery output_text ${label} citations must be non-empty`);
  }
  if (value.citationIds.some((id) => typeof id !== "string" || !citationIds.has(id))) {
    throw new Error(`Daily canonical recovery output_text ${label} references an unknown citation`);
  }
};

const visitCitationReferences = (
  value: unknown,
  citationIds: ReadonlySet<string>,
): void => {
  if (Array.isArray(value)) {
    value.forEach((entry) => visitCitationReferences(entry, citationIds));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "citationIds") {
      if (!Array.isArray(entry) || entry.some((id) =>
        typeof id !== "string" || !citationIds.has(id))) {
        throw new Error("Daily canonical recovery output_text references an unknown citation");
      }
      continue;
    }
    visitCitationReferences(entry, citationIds);
  }
};

export const canonicalJsonBytes = (value: unknown): Buffer =>
  Buffer.from(canonicalJson(value), "utf8");

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Daily canonical recovery value is not canonical JSON");
};

const assertExactObject = (
  value: unknown,
  keys: readonly string[],
  label: string,
): void => {
  if (
    !isObject(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys)
  ) {
    throw new Error(`Daily canonical recovery ${label} fields are invalid`);
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * JSON.parse deliberately keeps the last duplicate member. That would make a
 * forged raw selection indistinguishable after canonicalization, so scan every
 * object before applying the exact V4 field checks. Native parsing above still
 * owns full JSON grammar validation; this scanner only identifies duplicate
 * decoded keys without retaining any provider payload.
 */
const assertNoDuplicateJsonObjectKeys = (input: string): void => {
  const cursor = { offset: 0 };
  skipWhitespace(input, cursor);
  readJsonValue(input, cursor);
  skipWhitespace(input, cursor);
  if (cursor.offset !== input.length) {
    throw new Error("Daily canonical recovery output_text framing is invalid");
  }
};

const readJsonValue = (input: string, cursor: { offset: number }): void => {
  skipWhitespace(input, cursor);
  const character = input[cursor.offset];
  if (character === "{") return readJsonObject(input, cursor);
  if (character === "[") return readJsonArray(input, cursor);
  if (character === "\"") {
    readJsonString(input, cursor);
    return;
  }
  if (input.startsWith("true", cursor.offset)) {
    cursor.offset += 4;
    return;
  }
  if (input.startsWith("false", cursor.offset)) {
    cursor.offset += 5;
    return;
  }
  if (input.startsWith("null", cursor.offset)) {
    cursor.offset += 4;
    return;
  }
  const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u
    .exec(input.slice(cursor.offset));
  if (number?.[0] !== undefined) {
    cursor.offset += number[0].length;
    return;
  }
  throw new Error("Daily canonical recovery output_text framing is invalid");
};

const readJsonObject = (input: string, cursor: { offset: number }): void => {
  cursor.offset += 1;
  skipWhitespace(input, cursor);
  const keys = new Set<string>();
  if (input[cursor.offset] === "}") {
    cursor.offset += 1;
    return;
  }
  while (true) {
    if (input[cursor.offset] !== "\"") {
      throw new Error("Daily canonical recovery output_text framing is invalid");
    }
    const key = readJsonString(input, cursor);
    if (keys.has(key)) {
      throw new Error("Daily canonical recovery output_text contains duplicate JSON members");
    }
    keys.add(key);
    skipWhitespace(input, cursor);
    if (input[cursor.offset] !== ":") {
      throw new Error("Daily canonical recovery output_text framing is invalid");
    }
    cursor.offset += 1;
    readJsonValue(input, cursor);
    skipWhitespace(input, cursor);
    if (input[cursor.offset] === "}") {
      cursor.offset += 1;
      return;
    }
    if (input[cursor.offset] !== ",") {
      throw new Error("Daily canonical recovery output_text framing is invalid");
    }
    cursor.offset += 1;
    skipWhitespace(input, cursor);
  }
};

const readJsonArray = (input: string, cursor: { offset: number }): void => {
  cursor.offset += 1;
  skipWhitespace(input, cursor);
  if (input[cursor.offset] === "]") {
    cursor.offset += 1;
    return;
  }
  while (true) {
    readJsonValue(input, cursor);
    skipWhitespace(input, cursor);
    if (input[cursor.offset] === "]") {
      cursor.offset += 1;
      return;
    }
    if (input[cursor.offset] !== ",") {
      throw new Error("Daily canonical recovery output_text framing is invalid");
    }
    cursor.offset += 1;
    skipWhitespace(input, cursor);
  }
};

const readJsonString = (input: string, cursor: { offset: number }): string => {
  const start = cursor.offset;
  cursor.offset += 1;
  while (cursor.offset < input.length) {
    const character = input[cursor.offset];
    if (character === "\"") {
      cursor.offset += 1;
      return JSON.parse(input.slice(start, cursor.offset)) as string;
    }
    if (character === "\\") cursor.offset += 1;
    cursor.offset += 1;
  }
  throw new Error("Daily canonical recovery output_text framing is invalid");
};

const skipWhitespace = (input: string, cursor: { offset: number }): void => {
  while (/^[\u0009\u000a\u000d\u0020]$/u.test(input[cursor.offset] ?? "")) {
    cursor.offset += 1;
  }
};

const validateSchema = (
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
  root: Readonly<Record<string, unknown>>,
  path: string,
): void => {
  if (typeof schema.$ref === "string") {
    const target = schema.$ref.split("/").slice(1).reduce<unknown>(
      (current, key) => isObject(current) ? current[key] : undefined,
      root,
    );
    if (!isObject(target)) {
      throw new Error("Daily canonical recovery output schema reference is invalid");
    }
    validateSchema(value, target, root, path);
    return;
  }
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((entry) => Object.is(entry, value))) invalid(path);
    return;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some((type) => matchesType(value, type))) invalid(path);
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) invalid(path);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) invalid(path);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) invalid(path);
    if (typeof schema.maximum === "number" && value > schema.maximum) invalid(path);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) invalid(path);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) invalid(path);
    if (isObject(schema.items)) {
      value.forEach((entry, index) =>
        validateSchema(entry, schema.items as Record<string, unknown>, root, `${path}[${index}]`));
    }
  }
  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((key) => typeof key !== "string" || !(key in value))) invalid(path);
    if (schema.additionalProperties === false &&
      Object.keys(value).some((key) => !(key in properties))) invalid(path);
    for (const [key, entry] of Object.entries(value)) {
      const child = properties[key];
      if (isObject(child)) validateSchema(entry, child, root, `${path}.${key}`);
    }
  }
};

const matchesType = (value: unknown, type: unknown): boolean =>
  type === undefined ||
  (type === "null" && value === null) ||
  (type === "object" && isObject(value)) ||
  (type === "array" && Array.isArray(value)) ||
  (type === "string" && typeof value === "string") ||
  (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
  (type === "boolean" && typeof value === "boolean");

const invalid = (path: string): never => {
  throw new Error(
    `Daily canonical recovery output_text violates schema at ${path}`,
  );
};
