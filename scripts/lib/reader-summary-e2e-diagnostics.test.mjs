import assert from "node:assert/strict";
import test from "node:test";

import {
  ReaderSummaryDiagnosticRedactor,
  redactReaderSummaryDiagnostic,
} from "./reader-summary-e2e-diagnostics.mjs";

test("redacts bearer, quoted assignments, URL credentials, and query secrets", () => {
  const diagnostic = [
    "Authorization: Bearer bearer-value",
    'OPENAI_API_KEY="double-quoted-value"',
    "password='single-quoted-value'",
    "database_url=postgresql://user:url-password@database.invalid/app",
    "request=https://service.invalid/path?token=query-value&safe=yes",
  ].join("\n");
  const safe = redactReaderSummaryDiagnostic(diagnostic);
  assert.doesNotMatch(
    safe,
    /bearer-value|double-quoted-value|single-quoted-value|url-password|query-value/u,
  );
  assert.equal(safe.match(/\[REDACTED\]/gu)?.length, 5);
});

test("quoted token fields are escape-aware and fail closed", () => {
  const diagnostic = [
    String.raw`api_key="double-secret\"tail-secret" adjacent=safe`,
    String.raw`password='single-secret\'single-tail' next=visible`,
    String.raw`client_secret="slash-secret\\\"slash-tail" final=shown`,
    String.raw`cookie="escaped-cr\rcr-tail\nescaped-lf" safe=yes`,
    'session="actual-cr\rcr-secret\nactual-lf" after=kept',
    String.raw`signature="unterminated-secret\"tail-secret\"`,
  ].join("\n");
  const safe = redactReaderSummaryDiagnostic(diagnostic);

  assert.doesNotMatch(
    safe,
    /double-secret|tail-secret|single-secret|single-tail|slash-secret|slash-tail|cr-tail|actual-cr|cr-secret|actual-lf|escaped-lf|unterminated-secret/u,
  );
  assert.match(safe, /adjacent=safe/u);
  assert.match(safe, /next=visible/u);
  assert.match(safe, /final=shown/u);
  assert.match(safe, /safe=yes/u);
  assert.match(safe, /after=kept/u);
});

test("quoted token fields reject delimiter-like quotes without a field boundary", () => {
  const safe = redactReaderSummaryDiagnostic(
    String.raw`api_key="fake-secret\\"tail-secret" adjacent=kept`,
  );

  assert.equal(safe, "api_key=[REDACTED] adjacent=kept");
});

test("redacts the escaped quoted-tail regression without exposing its suffix", () => {
  const diagnostics = [
    String.raw`{api_key="[redacted:token-field]tail-secret\""}`,
    String.raw`{api_key=[redacted:token-field]tail-secret\"}`,
  ];

  for (const diagnostic of diagnostics) {
    const safe = redactReaderSummaryDiagnostic(diagnostic);
    assert.equal(safe, "{api_key=[REDACTED]}");
    assert.doesNotMatch(safe, /token-field|tail-secret/u);
  }
});

test("preserves adjacent non-sensitive fields and redacts bearer syntax", () => {
  const safe = redactReaderSummaryDiagnostic(
    'Authorization: Bearer bearer-secret, safe=visible; "api_token":"json-secret","next":"kept"',
  );
  assert.equal(
    safe,
    'Authorization=[REDACTED], safe=visible; "api_token":[REDACTED],"next":"kept"',
  );
});

test("stream redactor buffers incomplete lines so chunk splits cannot leak", () => {
  let output = "";
  const redactor = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => { output += safe; },
  });
  redactor.write("token=split-");
  assert.equal(output, "");
  redactor.write("value\nAuthorization: Bearer second-");
  assert.doesNotMatch(output, /split-value/u);
  redactor.write("value");
  redactor.flush();
  assert.doesNotMatch(output, /split-value|second-value/u);
  assert.equal(output.match(/\[REDACTED\]/gu)?.length, 2);
});

test("stream redaction is invariant across every chunk boundary", () => {
  const diagnostic = [
    String.raw`api_key="double-secret\"tail-secret" adjacent=visible`,
    String.raw`password='single-secret\'single-tail' next=kept`,
    String.raw`Authorization: Bearer bearer-secret`,
    String.raw`cookie="slash-secret\\\"slash-tail" final=shown`,
    'session="actual-cr\rcr-secret\nactual-lf" after=kept',
    "request=https://service.invalid/path?access_token=query-secret&safe=yes",
  ].join("\r\n") + "\r\n";
  const expected = redactReaderSummaryDiagnostic(diagnostic);
  const forbidden =
    /double-secret|tail-secret|single-secret|single-tail|bearer-secret|slash-secret|slash-tail|actual-cr|cr-secret|actual-lf|query-secret/u;

  for (let split = 0; split <= diagnostic.length; split += 1) {
    let output = "";
    const redactor = new ReaderSummaryDiagnosticRedactor({
      forward: (safe) => { output += safe; },
    });
    redactor.write(diagnostic.slice(0, split));
    redactor.write(diagnostic.slice(split));
    redactor.flush();
    assert.doesNotMatch(output, forbidden, `secret leaked at split ${split}`);
    assert.equal(output, expected, `redaction changed at split ${split}`);
  }

  let bytewiseOutput = "";
  const bytewise = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => { bytewiseOutput += safe; },
  });
  for (const character of diagnostic) bytewise.write(character);
  bytewise.flush();
  assert.equal(bytewiseOutput, expected);
});

test("escape-aware streaming stays invariant for quote and backslash runs", () => {
  const cases = [];
  for (const quote of ['"', "'"]) {
    for (const slashCount of [1, 3, 5]) {
      const slashes = "\\".repeat(slashCount);
      cases.push(
        `api_token=${quote}fake-${slashCount}${slashes}${quote}tail-${slashCount}${quote}, next=kept-${slashCount}`,
      );
    }
  }
  const diagnostic = `${cases.join("\r\n")}\r\n`;
  const expected = redactReaderSummaryDiagnostic(diagnostic);

  for (let split = 0; split <= diagnostic.length; split += 1) {
    let output = "";
    const redactor = new ReaderSummaryDiagnosticRedactor({
      forward: (safe) => { output += safe; },
    });
    redactor.write(diagnostic.slice(0, split));
    redactor.write(diagnostic.slice(split));
    redactor.flush();
    assert.equal(output, expected, `redaction changed at split ${split}`);
    assert.doesNotMatch(output, /fake-|tail-/u);
  }
});

test("stream redactor retains a quoted secret across CR and LF records", () => {
  let output = "";
  const redactor = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => { output += safe; },
  });
  redactor.write('visible\r\napi_key="first-secret\r');
  assert.equal(output, "visible\r\n");
  redactor.write('tail-secret\nlast-secret" adjacent=kept\r\n');
  redactor.flush();
  assert.equal(output, "visible\r\napi_key=[REDACTED] adjacent=kept\r\n");
});

test("stream redactor bounds an unterminated diagnostic line without leaking it", () => {
  let output = "";
  const redactor = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => { output += safe; },
  });
  redactor.write(`token=${"s".repeat(70_000)}`);
  redactor.write("continued-secret\nvisible line\n");
  assert.equal(
    output,
    "[REDACTED OVERSIZED DIAGNOSTIC LINE]\nvisible line\n",
  );
});

test("oversized quoted secrets fail closed across later record boundaries", () => {
  let output = "";
  const redactor = new ReaderSummaryDiagnosticRedactor({
    forward: (safe) => { output += safe; },
  });
  redactor.write(`visible\r\napi_key="${"s".repeat(70_000)}`);
  redactor.write('tail-secret\r\nstill-secret" adjacent=must-not-resume\r\n');
  redactor.flush();

  assert.equal(
    output,
    "visible\r\n[REDACTED OVERSIZED DIAGNOSTIC LINE]\n",
  );
  assert.doesNotMatch(output, /tail-secret|still-secret|must-not-resume/u);
});
