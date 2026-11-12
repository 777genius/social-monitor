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

function assertActiveCitationDelegation(source) {
  const ast = ts.createSourceFile("capture-durable-backend-e2e-loop.ts", source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, "runner must parse");
  const importNodes = ast.statements.filter((statement) =>
    ts.isImportDeclaration(statement) &&
    statement.moduleSpecifier.text === "./lib/durable-backend-e2e-citation-coverage");
  assert.equal(importNodes.length, 1, "one direct module import");
  const bindings = importNodes[0].importClause?.namedBindings;
  assert.ok(bindings && ts.isNamedImports(bindings));
  const imported = bindings.elements.map((element) => element.name.text);
  assert.deepEqual([...imported].sort(),
    ["ProviderCitationCoverage", "assertProviderCitationCoverage", "providerCitationCoverage"].sort());
  const expected = ["providerCitationCoverage", "assertProviderCitationCoverage"];
  const callers = new Map(expected.map((name) => [name, []]));
  function visit(node, caller) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      assert.ok(!expected.includes(node.name.text), "runner cannot duplicate extracted policy");
      caller = node.name.text;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      callers.has(node.expression.text)) {
      callers.get(node.expression.text).push(caller);
    }
    ts.forEachChild(node, (child) => visit(child, caller));
  }
  for (const statement of ast.statements) visit(statement, null);
  for (const name of expected) {
    assert.deepEqual([...callers.get(name)].sort(),
      ["captureReaderBriefEvidence", "executeBackendLoop"],
      `both existing ${name} calls must stay active in original paths`);
  }
}

test("runner retains the two original summary and reader-brief policy call sites", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assertActiveCitationDelegation(source);
});

test("missing imports, duplicate policy owners and disabled calls fail structural regression", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const cases = [
    source.replace('from "./lib/durable-backend-e2e-citation-coverage"', 'from "./lib/other-policy"'),
    source + "\nfunction providerCitationCoverage() {}\n",
    source.replace("const summaryCitationCoverage = providerCitationCoverage(", "const summaryCitationCoverage = deletedProviderCitationCoverage("),
    source.replace("const citationCoverage = providerCitationCoverage(", "const citationCoverage = deletedProviderCitationCoverage("),
    source.replace('assertProviderCitationCoverage("summary",', 'deletedAssertProviderCitationCoverage("summary",'),
    source.replace('assertProviderCitationCoverage("reader brief",', 'deletedAssertProviderCitationCoverage("reader brief",'),
  ];
  for (const changed of cases) {
    assert.notEqual(changed, source);
    assert.throws(() => assertActiveCitationDelegation(changed));
  }
});
