import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const checker = readFileSync(new URL("../check-source-provider-runtime-contract.ts", import.meta.url), "utf8");
const helper = readFileSync(new URL("../lib/source-provider-github-trending-runtime-smoke.ts", import.meta.url), "utf8");
const modulePath = "./lib/source-provider-github-trending-runtime-smoke";
const functionName = "verifyGitHubTrendingPageRuntime";
const call = "  await verifyGitHubTrendingPageRuntime({ withMockedFetch, assertFailure, contextFor, assert });";

function sourceAst(content, filename) {
  const ast = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, filename + " must parse");
  return ast;
}

function assertActualDelegation(content) {
  const ast = sourceAst(content, "runtime-checker.ts");
  const imports = ast.statements.filter(node =>
    ts.isImportDeclaration(node) && node.moduleSpecifier.text === modulePath);
  assert.equal(imports.length, 1, "exactly one real trending runtime import");
  assert.deepEqual(imports[0].importClause?.namedBindings?.elements.map(node => node.name.text),
    [functionName], "must import the original helper");
  assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) &&
    node.name?.text === functionName).length, 0, "legacy duplicate not allowed");
  const main = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "main");
  assert.ok(main?.body, "main entry point required");
  const calls = main.body.statements.flatMap(node => {
    if (!ts.isExpressionStatement(node) || !ts.isAwaitExpression(node.expression)) return [];
    const target = node.expression.expression;
    if (!ts.isCallExpression(target) || !ts.isIdentifier(target.expression)) return [];
    return [{ name: target.expression.text, args: target.arguments.map(arg => arg.getText(ast)) }];
  });
  const names = calls.map(item => item.name);
  assert.equal(names.filter(name => name === functionName).length, 1, "one active top-level await");
  assert.ok(names.indexOf("verifyGitHubRepoRadarRuntimeModes") >= 0 &&
    names.indexOf("verifyGitHubRepoRadarRuntimeModes") < names.indexOf(functionName),
    "trending runtime must follow repo radar");
  assert.ok(names.indexOf("verifyRssRuntimeGuards") > names.indexOf(functionName),
    "trending runtime must precede RSS");
  assert.deepEqual(calls.find(item => item.name === functionName)?.args,
    ["{ withMockedFetch, assertFailure, contextFor, assert }"],
    "must inject original trusted runtime dependencies");
}

test("checker owns one active GitHub Trending call in original order", () => {
  assertActualDelegation(checker);
});

test("helper exports original runtime scenario with mandatory HTTP and metadata invariants", () => {
  const ast = sourceAst(helper, "trending-smoke.ts");
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) &&
    node.name?.text === functionName);
  assert.equal(functions.length, 1);
  assert.ok(functions[0].modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
  const body = functions[0].body?.getText(ast) ?? "";
  for (const marker of [
    "github.com", "/trending/TypeScript", "spoken_language_code", "text/html,application/xhtml+xml",
    "social-monitor-runtime-contract", "openai/codex", "54000", "starsGained",
    "github_trending_html", "observedTrendingPageFetch", "rate_limited", "unavailable",
  ]) assert.ok(body.includes(marker), "missing original runtime invariant: " + marker);
});

test("deleted, commented, nested and unreachable calls cannot pass the static gate", () => {
  assert.ok(checker.includes(call), "expected canonical live call");
  for (const replacement of [
    "", "  // " + call.trim(), "  /* " + call.trim() + " */",
    "  if (false) {\n" + call + "\n  }",
    "  async function dormant() {\n" + call + "\n  }",
  ]) assert.throws(() => assertActualDelegation(checker.replace(call, replacement)));
});

test("wrong dependencies, misplaced sequence, duplicate calls and inline copies fail closed", () => {
  assert.throws(() => assertActualDelegation(checker.replace(call,
    "  await verifyGitHubTrendingPageRuntime({ withMockedFetch, assertFailure, assert });")));
  assert.throws(() => assertActualDelegation(checker.replace(
    "  await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert });\n" + call,
    call + "\n  await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert });")));
  assert.throws(() => assertActualDelegation(checker.replace(call, call + "\n" + call)));
  assert.throws(() => assertActualDelegation(checker + "\nasync function verifyGitHubTrendingPageRuntime() {}\n"));
});
