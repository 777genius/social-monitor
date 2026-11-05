const redacted = "[REDACTED]";
const oversizedDiagnostic = "[REDACTED OVERSIZED DIAGNOSTIC LINE]\n";
const maxPendingDiagnosticLength = 65_536;
const sensitiveKey =
  /^(?:[a-z0-9_-]*(?:token|api[_-]?key|secret|credential|authorization|password|session|cookie|signature|private[_-]?key|database_url))$/iu;
const urlPassword = /\b([a-z][a-z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s]+)@/giu;

const isKeyCharacter = (value) =>
  typeof value === "string" && /^[a-z0-9_-]$/iu.test(value);
const isQuotedValueBoundary = (value) =>
  value === undefined || /[\s,;<>{}[\]()&#]/u.test(value);

const quotedKeyAt = (diagnostic, start) => {
  const quote = diagnostic[start];
  if (quote !== '"' && quote !== "'") return undefined;
  let cursor = start + 1;
  while (cursor < diagnostic.length && isKeyCharacter(diagnostic[cursor])) {
    cursor += 1;
  }
  if (cursor === start + 1 || diagnostic[cursor] !== quote) return undefined;
  return {
    key: diagnostic.slice(start + 1, cursor),
    end: cursor + 1,
    quoted: true,
  };
};

const bareKeyAt = (diagnostic, start) => {
  if (!isKeyCharacter(diagnostic[start])) return undefined;
  if (start > 0 && isKeyCharacter(diagnostic[start - 1])) return undefined;
  let cursor = start + 1;
  while (cursor < diagnostic.length && isKeyCharacter(diagnostic[cursor])) {
    cursor += 1;
  }
  return { key: diagnostic.slice(start, cursor), end: cursor, quoted: false };
};

const assignmentAt = (diagnostic, start) => {
  const parsedKey = quotedKeyAt(diagnostic, start) ?? bareKeyAt(diagnostic, start);
  if (parsedKey === undefined || !sensitiveKey.test(parsedKey.key)) return undefined;
  let cursor = parsedKey.end;
  while (cursor < diagnostic.length && /\s/u.test(diagnostic[cursor])) cursor += 1;
  if (diagnostic[cursor] !== ":" && diagnostic[cursor] !== "=") return undefined;
  cursor += 1;
  while (cursor < diagnostic.length && /[\t ]/u.test(diagnostic[cursor])) cursor += 1;

  const valueStart = cursor;
  const replacementStart = parsedKey.quoted ? valueStart : parsedKey.end;
  const replacement = parsedKey.quoted ? redacted : `=${redacted}`;

  if (/^authorization$/iu.test(parsedKey.key)) {
    const bearer = diagnostic.slice(cursor).match(/^bearer[\t ]+/iu)?.[0];
    if (bearer !== undefined) cursor += bearer.length;
  }
  if (cursor >= diagnostic.length) {
    return {
      replacementStart,
      replacement,
      valueEnd: cursor,
      unterminatedQuote: false,
    };
  }

  const quote = diagnostic[cursor];
  if (quote === '"' || quote === "'") {
    let escaped = false;
    for (let valueEnd = cursor + 1; valueEnd < diagnostic.length; valueEnd += 1) {
      const character = diagnostic[valueEnd];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        character === quote &&
        isQuotedValueBoundary(diagnostic[valueEnd + 1])
      ) {
        return {
          replacementStart,
          replacement,
          valueEnd: valueEnd + 1,
          unterminatedQuote: false,
        };
      }
    }
    return {
      replacementStart,
      replacement,
      valueEnd: diagnostic.length,
      unterminatedQuote: true,
    };
  }

  let valueEnd = cursor;
  while (
    valueEnd < diagnostic.length &&
    !/[\s,;<>{}&#]/u.test(diagnostic[valueEnd])
  ) {
    valueEnd += 1;
  }
  return { replacementStart, replacement, valueEnd, unterminatedQuote: false };
};

const redactAssignments = (diagnostic) => {
  let cursor = 0;
  let safe = "";
  let unredactedStart = 0;
  let unterminatedAssignmentStart;
  while (cursor < diagnostic.length) {
    const assignment = assignmentAt(diagnostic, cursor);
    if (assignment === undefined) {
      cursor += 1;
      continue;
    }
    safe += `${diagnostic.slice(unredactedStart, assignment.replacementStart)}${assignment.replacement}`;
    unredactedStart = assignment.valueEnd;
    if (assignment.unterminatedQuote) {
      unterminatedAssignmentStart = cursor;
      cursor = diagnostic.length;
      break;
    }
    cursor = Math.max(assignment.valueEnd, cursor + 1);
  }
  safe += diagnostic.slice(unredactedStart);
  return { safe, unterminatedAssignmentStart };
};

const redactDiagnostic = (value, explicitSecrets) => {
  let diagnostic = Buffer.isBuffer(value)
    ? value.toString("utf8")
    : String(value ?? "");
  for (const secret of explicitSecrets) {
    if (typeof secret === "string" && secret !== "") {
      diagnostic = diagnostic.replaceAll(secret, redacted);
    }
  }
  const assignmentResult = redactAssignments(diagnostic);
  return {
    safe: assignmentResult.safe.replace(
      urlPassword,
      (_match, protocol) => `${protocol}${redacted}@`,
    ),
    unterminatedAssignmentStart: assignmentResult.unterminatedAssignmentStart,
  };
};

const lastRecordBoundaryBefore = (diagnostic, before) =>
  Math.max(
    diagnostic.lastIndexOf("\n", before - 1),
    diagnostic.lastIndexOf("\r", before - 1),
  );

export const redactReaderSummaryDiagnostic = (value, explicitSecrets = []) =>
  redactDiagnostic(value, explicitSecrets).safe;

export class ReaderSummaryDiagnosticRedactor {
  #pending = "";
  #discardingOversizedLine = false;
  #discardingRemainder = false;

  constructor({ explicitSecrets = [], forward }) {
    this.explicitSecrets = explicitSecrets;
    this.forward = forward;
  }

  write(value) {
    if (this.#discardingRemainder) return;
    let incoming = Buffer.isBuffer(value)
      ? value.toString("utf8")
      : String(value ?? "");
    if (this.#discardingOversizedLine) {
      const boundary = Math.max(incoming.indexOf("\n"), incoming.indexOf("\r"));
      if (boundary === -1) return;
      this.#discardingOversizedLine = false;
      incoming = incoming.slice(boundary + 1);
    }
    this.#pending += incoming;
    const boundary = Math.max(
      this.#pending.lastIndexOf("\n"),
      this.#pending.lastIndexOf("\r"),
    );
    if (boundary === -1) {
      this.#boundPendingIfNeeded();
      return;
    }

    const complete = this.#pending.slice(0, boundary + 1);
    const result = redactDiagnostic(complete, this.explicitSecrets);
    if (result.unterminatedAssignmentStart !== undefined) {
      const safeBoundary = lastRecordBoundaryBefore(
        complete,
        result.unterminatedAssignmentStart,
      );
      if (safeBoundary >= 0) {
        const safePrefix = this.#pending.slice(0, safeBoundary + 1);
        this.forward(
          redactReaderSummaryDiagnostic(safePrefix, this.explicitSecrets),
        );
        this.#pending = this.#pending.slice(safeBoundary + 1);
      }
      this.#boundPendingDiagnostic(true);
      return;
    }

    this.#pending = this.#pending.slice(boundary + 1);
    this.forward(result.safe);
    this.#boundPendingIfNeeded();
  }

  flush() {
    if (this.#discardingRemainder || this.#pending === "") return;
    this.forward(
      redactReaderSummaryDiagnostic(this.#pending, this.explicitSecrets),
    );
    this.#pending = "";
  }

  #boundPendingDiagnostic(containsUnterminatedSensitiveQuote) {
    if (this.#pending.length <= maxPendingDiagnosticLength) return;
    this.forward(oversizedDiagnostic);
    this.#pending = "";
    if (containsUnterminatedSensitiveQuote) {
      this.#discardingRemainder = true;
    } else {
      this.#discardingOversizedLine = true;
    }
  }

  #boundPendingIfNeeded() {
    if (this.#pending.length <= maxPendingDiagnosticLength) return;
    const result = redactDiagnostic(this.#pending, this.explicitSecrets);
    this.#boundPendingDiagnostic(
      result.unterminatedAssignmentStart !== undefined,
    );
  }
}

export const readerSummaryFailureDetails = (error, explicitSecrets = []) => {
  const parts = [];
  const message = redactReaderSummaryDiagnostic(error?.message, explicitSecrets).trim();
  const stdout = redactReaderSummaryDiagnostic(error?.stdout, explicitSecrets).trim();
  const stderr = redactReaderSummaryDiagnostic(error?.stderr, explicitSecrets).trim();
  if (message !== "") parts.push(`Cause: ${message}`);
  if (stdout !== "") parts.push(`stdout:\n${stdout}`);
  if (stderr !== "") parts.push(`stderr:\n${stderr}`);
  return parts.length === 0 ? "" : `\n${parts.join("\n")}`;
};
