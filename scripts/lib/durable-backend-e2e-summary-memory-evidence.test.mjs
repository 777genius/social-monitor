import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { safeMemoryContextDebug, summaryMemoryEvidenceSnapshot } from "./durable-backend-e2e-summary-memory-evidence.ts";

const params = { interestId: "topic-123", feedbackId: "feedback-456", feedbackProviderKey: "rss" };
const context = (patch = {}) => ({
  status: "available", sourceRefs: [], renderedText: "",
  diagnostics: { facts_used: 0, items_used: 0 }, ...patch,
});
const config = { memoryBaseUrl: "https://memory.example.invalid/private?token=secret" };

test("unavailable and uncorroborated memory remain fail-closed", () => {
  assert.equal(summaryMemoryEvidenceSnapshot(params, context({ status: "unavailable" }), config), undefined);
  assert.equal(summaryMemoryEvidenceSnapshot(params, context(), config), undefined);
});

test("feedback source refs retain sorted deduplicated types, diagnostics, and redaction", () => {
  const refs = [
    { source_type: "zeta", source_id: "other" },
    { source_type: "social-monitor.summary-feedback", source_id: params.feedbackId },
    { source_type: "zeta", source_id: "another" },
    { source_type: "alpha", source_id: "else" },
  ];
  const ctx = context({ sourceRefs: refs, renderedText: "private memo",
    diagnostics: { facts_used: 2, items_used: 1, retrieval_sources_used: ["memo"] } });
  const result = summaryMemoryEvidenceSnapshot(params, ctx, config);
  assert.equal(result.status, "available");
  assert.equal(result.memoryEffectMatched, true);
  assert.equal(result.memoryBaseUrlOrigin, "https://memory.example.invalid");
  assert.equal(result.topicScopeExternalRef, "interest:topic-123:feedback");
  assert.equal(result.providerScopeExternalRef, "interest:topic-123:provider:rss:quality");
  assert.deepEqual(result.sourceRefTypes, ["alpha", "social-monitor.summary-feedback", "zeta"]);
  assert.equal(result.sourceRefCount, 4);
  assert.equal(result.renderedTextChars, 12);
  assert.equal(result.factsUsed, 2);
  assert.equal(result.itemsUsed, 1);
  assert.deepEqual(result.retrievalSourcesUsed, ["memo"]);
  assert.deepEqual(ctx.sourceRefs, refs);
  assert.equal(JSON.stringify(result).includes("token=secret"), false);
});

test("rendered topic/provider matching retains case insensitive behavior and invalid URL redaction", () => {
  for (const renderedText of ["SUMMARY FEEDBACK FOR TOPIC TOPIC-123", "PROVIDER RSS"]) {
    const value = summaryMemoryEvidenceSnapshot(params, context({ renderedText }),
      { memoryBaseUrl: "not a url" });
    assert.equal(value.memoryEffectMatched, true);
    assert.equal(value.memoryBaseUrlOrigin, "invalid-url-redacted");
    assert.equal(value.renderedTextChars, renderedText.length);
  }
});

test("retrieval counter fallback and malformed projected values retain original semantics", () => {
  const a = summaryMemoryEvidenceSnapshot(params, context({
    retrieval: { factsUsed: 1, itemsUsed: 0, retrievalSourcesUsed: ["vector", "facts"] },
  }), config);
  assert.equal(a.factsUsed, 1);
  assert.deepEqual(a.retrievalSourcesUsed, ["vector", "facts"]);
  const b = summaryMemoryEvidenceSnapshot(params, context({
    diagnostics: { facts_used: "2", items_used: "0", retrieval_sources_used: ["valid", 2] },
  }), config);
  assert.equal(b.memoryEffectMatched, true);
  assert.equal(b.factsUsed, undefined);
  assert.equal(b.itemsUsed, undefined);
  assert.equal(b.retrievalSourcesUsed, undefined);
});

test("bounded diagnostics contain no source id or raw rendered text", () => {
  assert.equal(safeMemoryContextDebug(undefined), "{}");
  const output = safeMemoryContextDebug(context({
    sourceRefs: [{ source_type: "kind", source_id: "private-source-id" }],
    renderedText: "TOP SECRET DATA",
    diagnostics: { facts_used: 3, items_used: 1 },
  }));
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed.sourceRefTypes, ["kind"]);
  assert.equal(parsed.renderedTextChars, 15);
  assert.equal(parsed.factsUsed, 3);
  assert.equal(output.includes("TOP SECRET DATA"), false);
  assert.equal(output.includes("private-source-id"), false);
});

function verifyDelegation(source) {
  const ast = ts.createSourceFile("capture-durable-backend-e2e-loop.ts", source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const imports = ast.statements.filter((node) => ts.isImportDeclaration(node) &&
    node.moduleSpecifier.text === "./lib/durable-backend-e2e-summary-memory-evidence");
  assert.equal(imports.length, 1, "single direct policy import");
  const bindings = imports[0].importClause?.namedBindings;
  assert.ok(bindings && ts.isNamedImports(bindings));
  assert.deepEqual(bindings.elements.map(x => x.name.text).sort(),
    ["SummaryMemoryEvidence", "safeMemoryContextDebug", "summaryMemoryEvidenceSnapshot"].sort());
  const names = ["summaryMemoryEvidenceSnapshot", "safeMemoryContextDebug"];
  const calls = new Map(names.map(name => [name, []]));
  function visit(node, owner) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      assert.ok(!names.includes(node.name.text), "no duplicate implementation");
      owner = node.name.text;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && calls.has(node.expression.text))
      calls.get(node.expression.text).push(owner);
    ts.forEachChild(node, child => visit(child, owner));
  }
  for (const item of ast.statements) visit(item, null);
  for (const name of names)
    assert.deepEqual(calls.get(name), ["pollSummaryMemoryEvidence"], name + " must be called from original polling path");
}

test("original polling path retains both live imported policy calls", () => {
  verifyDelegation(readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8"));
});

test("missing import, duplicate owner and deleted real calls fail negative mutation tests", () => {
  const original = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  const variants = [
    original.replace('from "./lib/durable-backend-e2e-summary-memory-evidence"',
      'from "./lib/other-policy"'),
    original + "\nfunction safeMemoryContextDebug() {}\n",
    original + "\nfunction summaryMemoryEvidenceSnapshot() {}\n",
    original.replace("summaryMemoryEvidenceSnapshot(params, latest, config)",
      "removedSummaryMemoryEvidenceSnapshot(params, latest, config)"),
    original.replace("safeMemoryContextDebug(latest)", "removedSafeMemoryContextDebug(latest)"),
  ];
  for (const changed of variants) {
    assert.notEqual(changed, original);
    assert.throws(() => verifyDelegation(changed));
  }
});
