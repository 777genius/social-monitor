// Test-only AST guard: accept live destructuring only from the real input snapshot.
// Do not infer live dependencies from comments, dead functions, or arbitrary objects.
export function liveReadinessEntrypointBindings(ts, root) {
  const live = new Set();
  let snapshotImports = 0;
  let readFileImports = 0;
  let snapshotBindings = 0;

  for (const statement of root.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      ts.isNamedImports(statement.importClause?.namedBindings)) {
      const names = statement.importClause.namedBindings.elements;
      if (statement.moduleSpecifier.text === './lib/external-beta-readiness-input-snapshot.mjs') {
        snapshotImports += names.filter(x =>
          !x.propertyName && x.name.text === 'loadExternalBetaReadinessSnapshot').length;
      }
      if (statement.moduleSpecifier.text === 'node:fs') {
        readFileImports += names.filter(x => !x.propertyName && x.name.text === 'readFileSync').length;
        for (const element of names) {
          if (!element.propertyName) live.add(element.name.text);
        }
      }
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        live.add(declaration.name.text);
      }
      if (ts.isObjectBindingPattern(declaration.name) && declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === 'loadExternalBetaReadinessSnapshot' &&
        declaration.initializer.arguments.length === 1 &&
        ts.isIdentifier(declaration.initializer.arguments[0]) &&
        declaration.initializer.arguments[0].text === 'readFileSync' &&
        live.has('readFileSync')) {
        snapshotBindings += 1;
        for (const element of declaration.name.elements) {
          if (ts.isIdentifier(element.name) && !element.propertyName &&
            !element.dotDotDotToken && !element.initializer) {
            live.add(element.name.text);
          }
        }
      }
    }
  }
  return snapshotImports === 1 && readFileImports === 1 && snapshotBindings === 1 ? live : null;
}
