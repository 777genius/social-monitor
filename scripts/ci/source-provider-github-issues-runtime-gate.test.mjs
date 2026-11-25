import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const checker = readFileSync(new URL('../check-source-provider-runtime-contract.ts', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../lib/source-provider-github-issues-runtime-smoke.ts', import.meta.url), 'utf8');
const call = '  await verifyGitHubIssuesRuntimeModes({ withMockedFetch, assertFailure, assert });';
const modulePath = './lib/source-provider-github-issues-runtime-smoke';
const functionName = 'verifyGitHubIssuesRuntimeModes';

function assertActualDelegation(source) {
  const ast = ts.createSourceFile('runtime-checker.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, 'checker must parse');
  const imports = ast.statements.filter(node =>
    ts.isImportDeclaration(node) && node.moduleSpecifier.text === modulePath);
  assert.equal(imports.length, 1, 'must import one real Issues runtime owner');
  assert.deepEqual(imports[0].importClause.namedBindings.elements.map(node => node.name.text),
    [functionName]);
  assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) &&
    node.name?.text === functionName).length, 0, 'no duplicate legacy implementation');

  const main = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'main');
  assert.ok(main?.body, 'main must exist');
  const awaitCalls = main.body.statements.flatMap(node => {
    if (!ts.isExpressionStatement(node) || !ts.isAwaitExpression(node.expression)) return [];
    const expression = node.expression.expression;
    return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
      ? [{ name: expression.expression.text, args: expression.arguments.map(a => a.getText(ast)) }]
      : [];
  });
  const names = awaitCalls.map(node => node.name);
  assert.equal(names.filter(name => name === functionName).length, 1,
    'one actual awaited Issues smoke call is required');
  assert.ok(names.indexOf('verifyRedditPermanentOAuthRuntime') <
    names.indexOf(functionName), 'Issues must follow Reddit');
  assert.ok(names.indexOf(functionName) <
    names.indexOf('verifyGitHubRepoRadarRuntimeModes'), 'Issues must precede repo radar');
  assert.deepEqual(awaitCalls.find(node => node.name === functionName)?.args,
    ['{ withMockedFetch, assertFailure, assert }'], 'exact trusted test dependencies required');
}

test('checker delegates GitHub Issues runtime exactly once in original execution order', () => {
  assertActualDelegation(checker);
});

test('helper owns the actual exported runtime implementation and HTTP invariants', () => {
  const ast = ts.createSourceFile('issues-smoke.ts', helper, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const defs = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === functionName);
  assert.equal(defs.length, 1);
  assert.ok(defs[0].modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
  for (const marker of [
    'api.github.com', '/search/issues', 'application/vnd.github+json', '2022-11-28',
    'GitHub issues anonymous mode must omit Authorization',
    'GitHub issues HTTP errors must not leak token values',
    'GitHub issues client must fail closed on HTTP errors',
    'auth_failed', 'rate_limited', 'unavailable',
  ]) assert.ok(helper.includes(marker), 'missing original runtime invariant: ' + marker);
});

test('missing and commented-out delegation must fail closed', () => {
  assert.ok(checker.includes(call));
  for (const replacement of ['', '  // ' + call.trim(), '  /* ' + call.trim() + ' */']) {
    assert.throws(() => assertActualDelegation(checker.replace(call, replacement)));
  }
});

test('dormant conditional or nested function cannot masquerade as live delegation', () => {
  for (const replacement of [
    '  if (false) { ' + call.trim() + ' }',
    '  if (false) {\n' + call + '\n  }',
    '  async function dormant() {\n' + call + '\n  }',
  ]) assert.throws(() => assertActualDelegation(checker.replace(call, replacement)));
});

test('wrong dependency injection or reordered runtime checks must fail closed', () => {
  assert.throws(() => assertActualDelegation(checker.replace(
    call, '  await verifyGitHubIssuesRuntimeModes({ withMockedFetch, assertFailure });')));
  assert.throws(() => assertActualDelegation(checker.replace(
    '  await verifyRedditPermanentOAuthRuntime();\n' + call,
    call + '\n  await verifyRedditPermanentOAuthRuntime();')));
});

test('second call or legacy duplicate cannot satisfy the static boundary', () => {
  assert.throws(() => assertActualDelegation(checker.replace(call, call + '\n' + call)));
  assert.throws(() => assertActualDelegation(checker +
    '\nasync function verifyGitHubIssuesRuntimeModes() {}\n'));
});
