import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

export type CompositionImport = { readonly specifier: string; readonly names: readonly string[] };
export type CompositionSource = {
  readonly source: ts.SourceFile;
  readonly imports: readonly CompositionImport[];
  readonly names: readonly string[];
  readonly hasProviders: boolean;
  readonly hasRuntimeReexports: boolean;
  readonly hasRuntimeFactory: boolean;
};

/** A syntax-only export/local dependency walk; unrelated exports are not wiring dependencies. */
export function readCompositionSource(file: string, selected?: readonly string[]): CompositionSource {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imported = new Map<string, { specifier: string; name: string }>();
  const locals = new Map<string, ts.Node>();
  const exports = new Map<string, { local?: string; specifier?: string; name?: string }>();
  const stars: string[] = [];
  const sideEffects: string[] = [];
  const dependencies = new Map<string, Set<string>>();
  const names = new Set<string>();
  const visited = new Set<ts.Node>();
  let hasProviders = false;
  let hasRuntimeReexports = false;
  let hasRuntimeFactory = false;
  const text = (node: ts.Expression | undefined): string | undefined =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const addEdge = (specifier: string, name: string): void => {
    const current = dependencies.get(specifier) ?? new Set<string>();
    current.add(name);
    dependencies.set(specifier, current);
  };
  const register = (name: string, node: ts.Node, exported: boolean): void => {
    locals.set(name, node);
    if (exported) exports.set(name, { local: name });
  };
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = text(statement.moduleSpecifier)!;
      const clause = statement.importClause;
      if (!clause) sideEffects.push(specifier);
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) imported.set(clause.name.text, { specifier, name: 'default' });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) imported.set(bindings.name.text, { specifier, name: '*' });
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        if (!element.isTypeOnly) imported.set(element.name.text, { specifier, name: element.propertyName?.text ?? element.name.text });
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const specifier = text(statement.moduleSpecifier);
      const clause = statement.exportClause;
      if (!clause && specifier) stars.push(specifier);
      if (clause && ts.isNamespaceExport(clause) && specifier) {
        exports.set(clause.name.text, { specifier, name: '*' });
      }
      if (clause && ts.isNamedExports(clause)) for (const element of clause.elements) {
        if (element.isTypeOnly) continue;
        const name = element.propertyName?.text ?? element.name.text;
        exports.set(element.name.text, specifier ? { specifier, name } : { local: name });
      }
    } else if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly && ts.isExternalModuleReference(statement.moduleReference)) {
      const specifier = text(statement.moduleReference.expression);
      if (specifier) imported.set(statement.name.text, { specifier, name: '*' });
    } else {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) register(declaration.name.text, declaration, exported);
      }
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
        if (statement.name) register(statement.name.text, statement, exported);
        if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
          const local = statement.name?.text ?? 'default';
          locals.set(local, statement);
          exports.set('default', { local });
        }
      }
      if (ts.isExportAssignment(statement)) { locals.set('default', statement.expression); exports.set('default', { local: 'default' }); }
    }
  }
  const visitName = (name: string): void => {
    const dependency = imported.get(name);
    names.add(dependency?.name ?? name);
    if (dependency) addEdge(dependency.specifier, dependency.name);
    const declaration = locals.get(name);
    if (declaration) visit(declaration);
  };
  const visit = (node: ts.Node): void => {
    if (visited.has(node)) return;
    visited.add(node);
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) ||
        ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const specifier = text(node.arguments[0]);
      if (specifier) addEdge(specifier, '*');
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const namespace = imported.get(node.expression.text);
      if (namespace?.name === '*') {
        names.add(node.name.text);
        addEdge(namespace.specifier, node.name.text);
        return;
      }
    }
    if (ts.isArrayLiteralExpression(node) && node.elements.some((element) =>
      ts.isIdentifier(element) || ts.isSpreadElement(element) || ts.isObjectLiteralExpression(element) || ts.isNewExpression(element))) hasProviders = true;
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
        ['provide', 'useFactory', 'useClass', 'useExisting', 'providers'].includes(node.name.text)) hasProviders = true;
    if (ts.isIdentifier(node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) visitName(node.text);
    ts.forEachChild(node, visit);
  };
  const visitExport = (name: string): void => {
    const entry = exports.get(name);
    if (entry?.local) {
      const declaration = locals.get(entry.local);
      if (declaration && (ts.isFunctionDeclaration(declaration) ||
          (ts.isVariableDeclaration(declaration) && declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))))) {
        hasRuntimeFactory = true;
      }
      visitName(entry.local);
    }
    if (entry?.specifier) {
      hasRuntimeReexports = true;
      addEdge(entry.specifier, entry.name!);
      names.add(entry.name!);
    }
    if (!entry) for (const specifier of stars) {
      hasRuntimeReexports = true;
      addEdge(specifier, name);
    }
  };
  for (const specifier of sideEffects) addEdge(specifier, '*');
  if (!selected || selected.includes('*')) {
    visit(source);
    for (const name of exports.keys()) visitExport(name);
    for (const specifier of stars) {
      hasRuntimeReexports = true;
      addEdge(specifier, '*');
    }
  } else {
    for (const name of selected) visitExport(name);
  }
  return {
    source,
    imports: [...dependencies].map(([specifier, values]) => ({ specifier, names: [...values].sort() })),
    names: [...names],
    hasProviders,
    hasRuntimeReexports,
    hasRuntimeFactory,
  };
}
