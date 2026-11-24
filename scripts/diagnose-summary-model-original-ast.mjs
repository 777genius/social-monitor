// Diagnostic only: a runtime-token screen is not meaningful refactoring credit.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const prefix = 'libs/summary/adapters/model/';
const baseline = '3fa1b9e9ee5bd1302840d1164a975cde3f0eeaba';
const manifest = 'docs/iterations/2026-11-08-summary-model-adapters-10k-positions.json';
const eligible = path => path.startsWith(prefix) && path.endsWith('.ts') &&
  !/(?:\.spec|\.test|\.spec-support|\.fixture|-test-fixture)\.ts$/u.test(path);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const linesOf = text => text.replace(/\r\n/gu, '\n').split('\n');
const erasedKeywords = new Set([
  ts.SyntaxKind.AsKeyword, ts.SyntaxKind.SatisfiesKeyword, ts.SyntaxKind.DeclareKeyword,
  ts.SyntaxKind.AbstractKeyword, ts.SyntaxKind.ReadonlyKeyword, ts.SyntaxKind.OverrideKeyword,
  ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword,
]);
const modifiers = node => ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];

export const runtimeTokenLines = (text, filename = 'original.ts') => {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error(`Cannot classify invalid source: ${filename}`);
  const lines = linesOf(text);
  const positions = new Set();
  const visit = node => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
        ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) ||
        ts.isExportDeclaration(node) || ts.isTypeParameterDeclaration(node) ||
        ts.isJSDoc(node) || modifiers(node).some(m => m.kind === ts.SyntaxKind.DeclareKeyword ||
          (m.kind === ts.SyntaxKind.AbstractKeyword && !ts.isClassDeclaration(node)))) return;
    if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return;
    // An extends expression is evaluated at runtime; its type arguments are not.
    if (ts.isExpressionWithTypeArguments(node)) { visit(node.expression); return; }
    if (ts.isTypeNode(node) || (ts.isFunctionLike(node) && !node.body)) return;
    // Bare parameter declarations are not implementation credit. Defaults,
    // destructuring, rest and parameter properties may encode runtime behavior.
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && !node.initializer &&
        !node.dotDotDotToken && modifiers(node).length === 0) return;
    const children = node.getChildren(source);
    if (children.length) { for (const child of children) visit(child); return; }
    const kind = node.kind;
    if (kind === ts.SyntaxKind.EndOfFileToken || kind === ts.SyntaxKind.SyntaxList || erasedKeywords.has(kind) ||
        (kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation)) return;
    const start = node.getStart(source);
    if (node.end <= start) return;
    const first = source.getLineAndCharacterOfPosition(start).line;
    const last = source.getLineAndCharacterOfPosition(node.end - 1).line;
    for (let line = first; line <= last; line += 1) {
      const value = lines[line].trim();
      if (value && !/^[(){}\[\],:;`]+$/u.test(value)) positions.add(line + 1);
    }
  };
  visit(source);
  return positions;
};

const main = () => {
  const paths = git('ls-tree', '-r', '--name-only', baseline, '--', prefix).trimEnd().split('\n').filter(eligible);
  const ledger = JSON.parse(readFileSync(manifest, 'utf8'));
  if (ledger.baseline !== baseline || ledger.schemaVersion !== 1 || paths.length !== 84) {
    throw new Error('Frozen inventory mismatch');
  }
  const credited = new Map();
  for (const slice of ledger.slices) {
    const path = prefix + slice.original;
    if (!credited.has(path)) credited.set(path, new Set());
    for (const position of slice.originalPositions) credited.get(path).add(position);
  }
  let physical = 0;
  let candidates = 0;
  let changedCandidates = 0;
  let creditedCandidates = 0;
  const suspect = [];
  for (const path of paths) {
    const body = git('show', `${baseline}:${path}`);
    physical += linesOf(body).length - Number(body.endsWith('\n'));
    const positions = runtimeTokenLines(body, path);
    candidates += positions.size;
    const before = git('rev-parse', `${baseline}:${path}`).trim();
    let after = '';
    try { after = git('rev-parse', '--verify', `HEAD:${path}`).trim(); } catch { /* deleted original */ }
    if (before !== after) changedCandidates += positions.size;
    for (const position of credited.get(path) ?? []) {
      if (positions.has(position)) creditedCandidates += 1;
      else suspect.push(`${path}:${position}`);
    }
  }
  if (physical !== 15318) throw new Error(`Frozen physical total mismatch: ${physical}`);
  console.log(JSON.stringify({ compiler: ts.version, files: paths.length, physical, candidates,
    changedCandidates, creditedCandidates, creditedOutsideScreen: suspect }, null, 2));
  console.log('AST diagnostic only: no new credit, no independent semantic acceptance, no change to strict audit.');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
