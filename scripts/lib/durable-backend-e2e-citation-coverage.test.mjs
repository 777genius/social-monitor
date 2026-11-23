import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import {
  assertProviderCitationCoverage,
  providerCitationCoverage,
} from "./durable-backend-e2e-citation-coverage.ts";

test("citation coverage preserves sorted deduplication and original input values", () => {
  const expected = ["rss", "hacker-news", "rss", "reddit"];
  const cited = ["reddit", "github-issues", "reddit"];
  const result = providerCitationCoverage(expected, cited);
  assert.deepEqual(result, {
    expectedProviderKeys: ["hacker-news", "reddit", "rss"],
    citedProviderKeys: ["github-issues", "reddit"],
    uncitedProviderKeys: ["hacker-news", "rss"],
    minimumCitedProviderCount: 2,
  });
  assert.deepEqual(expected, ["rss", "hacker-news", "rss", "reddit"]);
  assert.deepEqual(cited, ["reddit", "github-issues", "reddit"]);
});

test("minimum provider-family threshold retains exact zero/small/large boundaries", () => {
  for (const [count, minimum] of [[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [5, 4], [6, 5]]) {
    const expected = Array.from({ length: count }, (_, index) => `provider-${index}`);
    const result = providerCitationCoverage(expected, []);
    assert.equal(result.minimumCitedProviderCount, minimum);
    assert.deepEqual(result.uncitedProviderKeys, expected);
  }
});

test("citation assertion retains original failure diagnostics and nonmutating success", () => {
  const coverage = providerCitationCoverage(["reddit", "rss", "github-issues"], ["reddit"]);
  const diagnostics = { citationCount: 1, sourceMixProviderKeys: ["reddit", "rss"] };
  assert.throws(
    () => assertProviderCitationCoverage("reader brief", coverage, diagnostics),
    (error) => {
      assert.match(error.message, /^reader brief citations must include at least 2 provider families: /);
      const diagnostic = JSON.parse(error.message.slice(error.message.indexOf("{")));
      assert.deepEqual(diagnostic, { ...coverage, ...diagnostics });
      return true;
    },
  );
  assert.equal(assertProviderCitationCoverage("summary", providerCitationCoverage(["rss", "reddit"], ["reddit", "rss"]), diagnostics), undefined);
});

function assertActiveCitationDelegation(source, file, policyPath, expectedOwner) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const imports = ast.statements.filter((node) => ts.isImportDeclaration(node) &&
    node.moduleSpecifier.text === policyPath);
  assert.equal(imports.length, 1);
  const bindings = imports[0].importClause?.namedBindings;
  assert.ok(bindings && ts.isNamedImports(bindings));
  assert.deepEqual(bindings.elements.map((el) => el.name.text).sort(),
    ["ProviderCitationCoverage", "assertProviderCitationCoverage", "providerCitationCoverage"].sort());
  const names = ["providerCitationCoverage", "assertProviderCitationCoverage"];
  const calls = new Map(names.map((name) => [name, []]));
  function visit(node, owner) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      assert.ok(!calls.has(node.name.text), "duplicate policy implementation");
      owner = node.name.text;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && calls.has(node.expression.text)) {
      calls.get(node.expression.text).push(owner);
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  for (const stmt of ast.statements) visit(stmt, null);
  for (const owners of calls.values()) assert.deepEqual(owners, [expectedOwner]);
}
function assertRunnerReaderDelegation(source) {
  const ast = ts.createSourceFile("runner.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0);
  assert.equal(ast.statements.filter((node) => ts.isImportDeclaration(node) &&
    node.moduleSpecifier.text === "./lib/durable-backend-e2e-reader-brief").length, 1);
  const calls = [];
  function visit(node, owner) {
    if (ts.isFunctionDeclaration(node) && node.name) owner = node.name.text;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === "captureReaderBriefEvidence") calls.push([owner, node.arguments.length]);
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  for (const stmt of ast.statements) visit(stmt, null);
  assert.deepEqual(calls, [["executeBackendLoop", 2]]);
}
test("two original citation call paths remain active across extracted reader boundary", () => {
  const r = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const m = readFileSync(new URL("./durable-backend-e2e-reader-brief.ts", import.meta.url), "utf8");
  assertActiveCitationDelegation(r, "runner.ts", "./lib/durable-backend-e2e-citation-coverage", "executeBackendLoop");
  assertActiveCitationDelegation(m, "reader.ts", "./durable-backend-e2e-citation-coverage", "captureReaderBriefEvidence");
  assertRunnerReaderDelegation(r);
});
test("disabled or commented citation calls, bad imports, missing HTTP injection and duplicate owners fail", () => {
  const r = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const m = readFileSync(new URL("./durable-backend-e2e-reader-brief.ts", import.meta.url), "utf8");
  for (const changed of [
    r.replace('from "./lib/durable-backend-e2e-citation-coverage"', 'from "./lib/no-policy"'),
    r.replace("const summaryCitationCoverage = providerCitationCoverage(", "const summaryCitationCoverage = disabledCoverage("),
    r.replace('assertProviderCitationCoverage("summary",', 'disabledAssertProviderCitationCoverage("summary",'),
    r + "\nfunction providerCitationCoverage() {}\n",
  ]) {
    assert.notEqual(changed, r);
    assert.throws(() => assertActiveCitationDelegation(changed, "runner.ts",
      "./lib/durable-backend-e2e-citation-coverage", "executeBackendLoop"));
  }
  for (const changed of [
    m.replace('from "./durable-backend-e2e-citation-coverage"', 'from "./no-policy"'),
    m.replace("const citationCoverage = providerCitationCoverage(", "const citationCoverage = disabledCoverage("),
    m.replace('assertProviderCitationCoverage("reader brief",', 'disabledAssertProviderCitationCoverage("reader brief",'),
    m + "\nfunction providerCitationCoverage() {}\n",
  ]) {
    assert.notEqual(changed, m);
    assert.throws(() => assertActiveCitationDelegation(changed, "reader.ts",
      "./durable-backend-e2e-citation-coverage", "captureReaderBriefEvidence"));
  }
  for (const changed of [
    r.replace('from "./lib/durable-backend-e2e-reader-brief"', 'from "./lib/no-reader"'),
    r.replace("const readerBrief = await captureReaderBriefEvidence(", "const readerBrief = await disabledReader("),
    r.replace("}, { requestJson, pollJson });", "});"),
  ]) {
    assert.notEqual(changed, r);
    assert.throws(() => assertRunnerReaderDelegation(changed));
  }
});
