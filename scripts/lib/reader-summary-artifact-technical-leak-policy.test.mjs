import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import {
  collectUserFacingTechnicalLeaks,
  countUiPayloadTechnicalTags,
} from "./reader-summary-artifact-technical-leak-policy.ts";

const emptyContent = () => ({
  headline: "",
  oneLineTakeaway: "",
  bullets: [],
  topReads: [],
  selectedPosts: [],
  risks: [],
  openQuestions: [],
  nextActions: [],
});

test("all nine original user-facing technical leakage patterns stay effective", () => {
  const indicators = [
    "source item",
    "canonicalUrl",
    "source-binding",
    "sourcebinding",
    "interest:12345678",
    "provider:reddit",
    "feed_item",
    "source_item",
    "123e4567-e89b-12d3-a456-426614174000",
  ];
  const content = { ...emptyContent(), bullets: indicators };
  assert.deepEqual(collectUserFacingTechnicalLeaks(content), indicators);
  assert.deepEqual(content.bullets, indicators);
});

test("clean prose, short tokens and boundary near-misses stay accepted", () => {
  const content = {
    ...emptyContent(),
    headline: "The news in brief",
    bullets: ["canonical URL", "provider", "source itemized", "interest:1234", "feed items"],
  };
  assert.deepEqual(collectUserFacingTechnicalLeaks(content), []);
  assert.deepEqual(collectUserFacingTechnicalLeaks(emptyContent()), []);
  assert.deepEqual(
    collectUserFacingTechnicalLeaks({ ...emptyContent(), risks: ["CANONICALURL"] }),
    ["CANONICALURL"],
  );
});

test("all nested reader-facing fields retain their original scan order", () => {
  const content = {
    ...emptyContent(),
    headline: "provider:reddit",
    bullets: ["feed_item"],
    risks: ["source item"],
    openQuestions: ["canonicalUrl"],
    nextActions: [{ label: "clean", reason: "sourcebinding" }],
    topReads: [{ title: "clean", reason: "source-binding", whyNow: "clean", whyImportant: ["source_item"] }],
    selectedPosts: [{ title: "clean", reason: "interest:12345678", whyNow: "clean", whyImportant: [] }],
  };
  assert.deepEqual(collectUserFacingTechnicalLeaks(content), [
    "provider:reddit", "feed_item", "source item", "canonicalUrl",
    "sourcebinding", "source-binding", "source_item", "interest:12345678",
  ]);
});

test("UI technical tag prefixes stay case insensitive, anchored and nonmutating", () => {
  const items = [
    { matchedRules: [
      "interest:a", "source-binding:a", "sourcebinding:a", "provider:a",
      "rule:a", "binding:a", "scope:a", "not-provider:a", "interest", "",
    ] },
    { matchedRules: ["PROVIDER:R", "prefix:rule:a"] },
  ];
  const before = items.map(({ matchedRules }) => ({ matchedRules: [...matchedRules] }));
  assert.equal(countUiPayloadTechnicalTags(items), 8);
  assert.equal(countUiPayloadTechnicalTags([]), 0);
  assert.deepEqual(items, before);
});

function assertActiveDelegation(source) {
  const ast = ts.createSourceFile("check-yesterday-reader-summary-artifact-quality.ts", source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, "runner must parse");
  const importNodes = ast.statements.filter((statement) =>
    ts.isImportDeclaration(statement) &&
    statement.moduleSpecifier.text === "./lib/reader-summary-artifact-technical-leak-policy");
  assert.equal(importNodes.length, 1, "one direct policy import");
  const bindings = importNodes[0].importClause?.namedBindings;
  assert.ok(bindings && ts.isNamedImports(bindings));
  const names = ["collectUserFacingTechnicalLeaks", "countUiPayloadTechnicalTags"];
  assert.deepEqual(bindings.elements.map((entry) => entry.name.text).sort(), [...names].sort());
  const calls = new Map(names.map((name) => [name, []]));
  function visit(node, caller) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      assert.ok(!calls.has(node.name.text), "duplicate original policy function");
      caller = node.name.text;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      assert.notEqual(node.name.text, "technicalLeakPatterns", "regex inventory must have one owner");
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && calls.has(node.expression.text)) {
      calls.get(node.expression.text).push(caller);
    }
    ts.forEachChild(node, (child) => visit(child, caller));
  }
  for (const node of ast.statements) visit(node, null);
  for (const name of names) {
    assert.deepEqual(calls.get(name), ["buildReport"], `original ${name} call must stay live`);
  }
}

test("the original reporting path still calls both extracted policy functions", () => {
  const source = readFileSync(new URL("../check-yesterday-reader-summary-artifact-quality.ts", import.meta.url), "utf8");
  assertActiveDelegation(source);
});

test("missing import, duplicate ownership and disabled policy calls fail closed", () => {
  const source = readFileSync(new URL("../check-yesterday-reader-summary-artifact-quality.ts", import.meta.url), "utf8");
  const variants = [
    source.replace('from "./lib/reader-summary-artifact-technical-leak-policy"', 'from "./lib/other-policy"'),
    source + "\nfunction collectUserFacingTechnicalLeaks() {}\n",
    source + "\nconst technicalLeakPatterns = [];\n",
    source.replace("collectUserFacingTechnicalLeaks(", "removedCollectUserFacingTechnicalLeaks("),
    source.replace("countUiPayloadTechnicalTags(", "removedCountUiPayloadTechnicalTags("),
  ];
  for (const variant of variants) {
    assert.notEqual(variant, source);
    assert.throws(() => assertActiveDelegation(variant));
  }
});
