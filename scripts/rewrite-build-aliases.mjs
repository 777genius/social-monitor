#!/usr/bin/env node
// Project-specific post-emit rewrite; TypeScript remains the compiler.
import ts from "typescript";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function inside(root, file) {
  const rel = relative(root, file);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function regularPath(file, directory = false) {
  for (let path = file; ; path = dirname(path)) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Unsafe symlink: ${path}`);
    if (path === file && (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) {
      throw new Error(`Unsafe output/config path: ${path}`);
    }
    if (dirname(path) === path) break;
  }
}

function argumentsFor(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = { "-p": "project", "--project": "project", "--outDir": "outDir" }[args[i]];
    if (!key || values[key] || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("Usage: rewrite-build-aliases.mjs -p CONFIG [--outDir DIRECTORY]");
    }
    values[key] = args[i + 1];
  }
  if (!values.project) throw new Error("Missing -p CONFIG");
  return values;
}

function rewrite(args) {
  const flags = argumentsFor(args);
  const configPath = resolve(flags.project);
  regularPath(configPath);
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, "\n"));
  const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(configPath),
    flags.outDir ? { outDir: resolve(flags.outDir) } : {}, configPath);
  const { options } = config;
  if (!options.rootDir || !options.outDir || options.outFile || options.declarationDir ||
      options.noEmit || options.emitDeclarationOnly) {
    throw new Error("Expected explicit rootDir/outDir and JS/declaration build output");
  }
  const root = resolve(options.rootDir);
  const output = resolve(options.outDir);
  if (inside(output, root) || inside(output, configPath)) throw new Error("Unsafe output root overlaps source/config");
  if (config.errors.length) throw new Error(ts.formatDiagnostics(config.errors, {
    getCanonicalFileName: (file) => file, getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => "\n",
  }));
  regularPath(root, true);
  regularPath(output, true);
  const paths = Object.entries(options.paths ?? {});
  if (!paths.length || paths.some(([key]) => !key.startsWith("@social-monitor/") || key.split("*").length > 2)) {
    throw new Error("Expected finite @social-monitor path aliases");
  }
  const exact = new Map(paths.filter(([key]) => !key.includes("*")));
  const wildcards = paths.filter(([key]) => key.includes("*")).map(([key, targets]) => {
    const [prefix, suffix] = key.split("*");
    return { prefix, suffix, targets };
  }).sort((a, b) => b.prefix.length - a.prefix.length);
  const base = options.baseUrl ?? options.pathsBasePath ?? dirname(configPath);
  const resolutionOptions = { ...options, paths: undefined, baseUrl: undefined };
  const resolutionHost = { ...ts.sys, fileExists: (file) => {
    if (!ts.sys.fileExists(file)) return false;
    regularPath(resolve(file));
    return true;
  } };
  const files = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`Unsafe symlink: ${file}`);
      if (stat.isDirectory()) walk(file);
      else if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Unsafe output path: ${file}`);
      else if (file.endsWith(".js") || file.endsWith(".d.ts")) files.push(file);
    }
  }
  walk(output);
  if (!files.length) throw new Error("Missing emitted JS/declaration output");

  function targetFor(specifier, importer) {
    let targets = exact.get(specifier);
    let capture = "";
    if (!targets) {
      const match = wildcards.find(({ prefix, suffix }) => specifier.startsWith(prefix) &&
        specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length);
      if (!match) return undefined;
      targets = match.targets;
      capture = specifier.slice(match.prefix.length, specifier.length - match.suffix.length || undefined);
    }
    for (const target of targets) {
      const candidate = resolve(base, target.replace("*", capture));
      const source = ts.resolveModuleName(candidate, join(root, "__alias_resolution__.ts"),
        resolutionOptions, resolutionHost).resolvedModule?.resolvedFileName;
      if (!source || !inside(root, resolve(source)) || source.endsWith(".d.ts")) continue;
      const emitted = ts.getOutputFileNames({ ...config, fileNames: [resolve(source)] }, resolve(source), false)
        .find((file) => importer.endsWith(".d.ts") ? file.endsWith(".d.ts") : file.endsWith(".js"));
      if (!emitted || !inside(output, resolve(emitted)) || !ts.sys.fileExists(emitted)) continue;
      regularPath(resolve(emitted));
      let result = relative(dirname(importer), emitted).split(sep).join("/").replace(/(?:\.d\.ts|\.js)$/, "");
      if (!result.startsWith(".")) result = `./${result}`;
      return result;
    }
    throw new Error(`Unresolved configured alias ${specifier} in ${importer}`);
  }

  // Validate all edits before writing. Preserve other text and sourcemap bytes.
  const changes = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      file.endsWith(".d.ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    if (ast.parseDiagnostics.length) throw new Error(`Invalid emitted module syntax: ${file}`);
    const edits = [];
    function visit(node) {
      let literal;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal = node.moduleSpecifier;
      else if (ts.isModuleDeclaration(node)) literal = node.name;
      else if (ts.isExternalModuleReference(node)) literal = node.expression;
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal = node.argument.literal;
      else if (ts.isCallExpression(node) && node.arguments.length === 1 &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require"))) literal = node.arguments[0];
      if (literal && ts.isStringLiteral(literal)) {
        const replacement = targetFor(literal.text, file);
        if (replacement !== undefined) {
          const start = literal.getStart(ast) + 1;
          const end = literal.getEnd() - 1;
          const quote = text[start - 1];
          const escaped = replacement.replace(/\\/g, "\\\\").replaceAll(quote, `\\${quote}`);
          edits.push({ start, end, replacement: escaped });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    let updated = text;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
    }
    if (updated !== text) changes.push([file, updated]);
  }
  for (const [file, text] of changes) {
    regularPath(file);
    if (!inside(output, file)) throw new Error(`Unsafe output write: ${file}`);
    writeFileSync(file, text);
  }
  process.stdout.write(`Rewrote build aliases in ${changes.length} emitted files\n`);
}

try { rewrite(process.argv.slice(2)); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
