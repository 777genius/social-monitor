import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire, builtinModules } from "node:module";
import { EventEmitter } from "node:events";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import type { ForkOptions } from "node:child_process";
import type { Service } from "ts-node";

type TestModule = {
  exports: unknown; filename: string; require: NodeRequire;
  _compile: (code: string, filename: string) => void;
};

/** Execute installed CJS preloads and the exact fork entry in one private realm.
 * Every non-builtin dependency (including TypeScript and source-map support)
 * uses private require/cache/createRequire. No host registration is restored:
 * it is never installed. This is a fake child, not an OS/durability proof. */
export function loadCuratedFirstpubCrashChild(
  filename: string, options: ForkOptions,
  ipc: { once: (event: string, listener: (message: unknown) => void) => unknown; send: (message: unknown) => void },
  dependencies: Readonly<Record<string, unknown>>,
) {
  const cwd = options.cwd;
  if (typeof cwd !== "string" || options.env === undefined) throw new Error("Explicit fork cwd/env required");
  const events = new EventEmitter();
  const fakeProcess = Object.assign(events, {
    env: { ...options.env }, cwd: () => cwd, argv: [process.execPath, filename], execArgv: options.execArgv ?? [],
    versions: process.versions, version: process.version, platform: process.platform,
    nextTick: process.nextTick, stdout: { isTTY: false }, send: ipc.send,
  });
  const localOnce = events.once.bind(events);
  fakeProcess.once = ((event: string, listener: (message: unknown) => void) =>
    event === "message" ? ipc.once(event, listener) : localOnce(event, listener)) as typeof events.once;
  const context = createContext({ process: fakeProcess, Buffer, console, setTimeout, clearTimeout, setImmediate });
  const privateGlobal = runInContext("globalThis", context) as Record<PropertyKey, unknown>;
  const cache: Record<string, TestModule> = Object.create(null) as Record<string, TestModule>;
  const forbiddenProcess = () => { throw new Error("OS processes forbidden in loader regression"); };
  const extensions: Record<string, (mod: TestModule, file: string) => void> = {
    ".js": (mod, file) => mod._compile(readFileSync(file, "utf8"), file),
    ".json": (mod, file) => { mod.exports = JSON.parse(readFileSync(file, "utf8")) as unknown; },
  };
  // Resolution is filesystem-only: even host createRequire.resolve would write
  // Node's shared _pathCache. This small CJS resolver is for the pinned packages,
  // not a general Node loader. Unsupported exports/native modules fail closed.
  const isFile = (file: string) => statSync(file, { throwIfNoEntry: false })?.isFile() === true;
  const exportTarget = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      for (const target of value) {
        const found = exportTarget(target);
        if (found) return found;
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [condition, target] of Object.entries(value)) {
        if (["require", "node", "default"].includes(condition)) {
          const found = exportTarget(target);
          if (found) return found;
        }
      }
    }
    return undefined;
  };
  const findFile = (candidate: string): string | undefined => {
    for (const file of [candidate, candidate + ".js", candidate + ".json"]) {
      if (isFile(file)) return realpathSync(file);
    }
    const packageFile = join(candidate, "package.json");
    if (isFile(packageFile)) {
      const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as { main?: string };
      if (pkg.main) {
        const target = resolve(candidate, pkg.main);
        if (target !== candidate) {
          const found = findFile(target);
          if (found) return found;
        }
      }
    }
    for (const file of [join(candidate, "index.js"), join(candidate, "index.json")]) {
      if (isFile(file)) return realpathSync(file);
    }
    return undefined;
  };
  const resolveCjs = (name: string, parent: { filename: string }, lookup?: { paths?: string[] }): string => {
    if (builtinModules.includes(name) || name.startsWith("node:")) return name;
    if (isAbsolute(name) || name.startsWith(".")) {
      const found = findFile(resolve(dirname(parent.filename), name));
      if (found) return found;
    } else {
      const parts = name.split("/");
      const packageName = parts.splice(0, name.startsWith("@") ? 2 : 1).join("/");
      for (const start of lookup?.paths ?? [dirname(parent.filename)]) {
        for (let directory = resolve(start); ; directory = dirname(directory)) {
          const root = join(directory, "node_modules", packageName);
          const packageFile = join(root, "package.json");
          if (isFile(packageFile)) {
            const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as { exports?: unknown };
            let candidate = join(root, ...parts);
            if (pkg.exports !== undefined) {
              const key = parts.length ? "./" + parts.join("/") : ".";
              const map = pkg.exports as Record<string, unknown>;
              const target = exportTarget(Object.hasOwn(map, key) ? map[key] : key === "." ? pkg.exports : undefined);
              if (!target?.startsWith("./")) throw new Error(`Unsupported CJS export: ${name}`);
              candidate = resolve(root, target);
            }
            const found = findFile(candidate);
            if (found) return found;
          }
          if (dirname(directory) === directory) break;
        }
      }
    }
    throw Object.assign(new Error(`Cannot resolve private CJS module: ${name}`), { code: "MODULE_NOT_FOUND" });
  };
  const moduleFacade = {
    createRequire: (source: string) => makeRequire(source), builtinModules,
    Module: { _preloadModules: (names: string[]) => { for (const name of names) makeRequire(filename)(name); } },
    _resolveFilename: resolveCjs,
    _cache: cache, _extensions: extensions,
  };
  let main: TestModule;
  const makeRequire = (source: string): NodeRequire => {
    const req = Object.assign((name: string): unknown => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name === "module" || name === "node:module") return moduleFacade;
      if (name === "process" || name === "node:process") return fakeProcess;
      // ts-node imports REPL eagerly, but compilation never uses it. Loading
      // Node's REPL initializes domain and patches host EventEmitter/process.
      // Permit the unused import, fail closed on any interactive capability.
      if (["repl", "node:repl", "domain", "node:domain"].includes(name)) {
        return new Proxy({}, { get: () => { throw new Error("Interactive runtime forbidden in loader regression"); } });
      }
      if (name === "child_process" || name === "node:child_process") return { fork: forbiddenProcess, spawnSync: forbiddenProcess };
      const file = moduleFacade._resolveFilename(name, { filename: source });
      if (builtinModules.includes(file) || file.startsWith("node:")) return createRequire(source)(file) as unknown;
      return load(file);
    }, {
      resolve: Object.assign((name: string, lookup?: { paths?: string[] }) =>
        moduleFacade._resolveFilename(name, { filename: source }, lookup), { paths: () => null }),
      extensions, cache, main,
    });
    return req as unknown as NodeRequire;
  };
  const load = (file: string): unknown => {
    const cached = cache[file];
    if (cached) return cached.exports;
    const mod: TestModule = { exports: {}, filename: file, require: makeRequire(file), _compile: (code, source) => {
      const execute = runInContext(`(function(require,module,exports,__filename,__dirname){${code}\n})`, context,
        { filename: source }) as (req: unknown, mod: TestModule, exports: unknown, source: string, directory: string) => void;
      execute(mod.require, mod, mod.exports, source, dirname(source));
    } };
    cache[file] = mod;
    if (file === filename) { main = mod; mod.require.main = mod as unknown as NodeModule; }
    try {
      const compile = extensions[extname(file)];
      if (!compile) throw new Error(`Unsupported private CJS extension: ${extname(file)}`);
      compile(mod, file);
    } catch (error) { delete cache[file]; throw error; }
    return mod.exports;
  };
  const args = options.execArgv ?? [];
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] !== "-r" || !args[i + 1]) throw new Error("Only explicit CJS preloads allowed");
    makeRequire(filename)(args[i + 1]!);
  }
  load(filename);
  const service = Reflect.get(fakeProcess, Symbol.for("ts-node.register.instance")) as Service;
  const observed = { project: service.options.project, rootDir: service.config.options.rootDir,
    transpileOnly: service.options.transpileOnly, entry: filename };
  const isolation = { module: moduleFacade, process: fakeProcess, global: privateGlobal };
  return Object.defineProperty(observed, "isolation", { value: isolation }) as typeof observed & { isolation: typeof isolation };
}
