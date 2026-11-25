import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const original = readFileSync(new URL('../check-source-provider-runtime-contract.ts', import.meta.url), 'utf8');
const directCall = '  await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert });';

function assertRadarDelegation(source) {
  assert.match(source, /import\s*\{\s*verifyGitHubRepoRadarRuntimeModes\s*\}\s*from\s*["']\.\/lib\/source-provider-github-repo-radar-runtime-smoke["']/);
  assert.doesNotMatch(source, /async function verifyGitHubRepoRadarRuntimeModes\s*\(/);
  const ast = ts.createSourceFile('check-source-provider-runtime-contract.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, 'runtime checker must parse as TypeScript');
  const main = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'main');
  assert.ok(main?.body, 'main must exist');
  const invocations = main.body.statements
    .filter(node => ts.isExpressionStatement(node) && ts.isAwaitExpression(node.expression))
    .map(node => node.expression.expression)
    .filter(node => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'verifyGitHubRepoRadarRuntimeModes');
  assert.equal(invocations.length, 1, 'main must await the radar runtime smoke directly exactly once');
  const call = invocations[0];
  assert.equal(call.arguments.length, 1, 'runtime smoke dependencies must be explicit');
  const args = call.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(args), 'runtime smoke dependency object is required');
  const keys = args.properties.map(property => {
    assert.ok(ts.isShorthandPropertyAssignment(property), 'smoke dependencies must use live checker bindings');
    return property.name.text;
  });
  assert.deepEqual(keys, ['withMockedFetch', 'assertFailure', 'contextFor', 'assert']);
}

test('main directly awaits extracted radar smoke with the existing checker dependencies', () => {
  assertRadarDelegation(original);
});

test('missing, dormant and duplicated radar smoke invocations fail closed', () => {
  for (const replacement of [
    '',
    '  if (false) { await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert }); }',
    '  const unused = "await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert });";',
    directCall + '\n' + directCall,
  ]) {
    assert.ok(original.includes(directCall));
    assert.throws(() => assertRadarDelegation(original.replace(directCall, replacement)));
  }
});

test('missing import or tampered dependency wiring fail closed', () => {
  assert.throws(() => assertRadarDelegation(original.replace(
    'import { verifyGitHubRepoRadarRuntimeModes } from "./lib/source-provider-github-repo-radar-runtime-smoke";', '',
  )));
  for (const altered of [
    'await verifyGitHubRepoRadarRuntimeModes();',
    'await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor });',
    'await verifyGitHubRepoRadarRuntimeModes({ withMockedFetch, assertFailure, contextFor, assert: () => {} });',
  ]) {
    assert.throws(() => assertRadarDelegation(original.replace(directCall, '  ' + altered)));
  }
});
