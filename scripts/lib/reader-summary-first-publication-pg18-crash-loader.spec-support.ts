import { readFileSync } from "node:fs";
import { createRequire, builtinModules } from "node:module";
import { dirname, extname } from "node:path";
import { runInNewContext } from "node:vm";
import type { ForkOptions } from "node:child_process";
import type { Service } from "ts-node";

type TestModule = {
  exports: unknown; filename: string;
  _compile: (code: string, filename: string) => void;
};

/** Execute the exact fork entry through its actual installed CJS preloads.
 * Only the loader packages are isolated; process/IPC, pg and module hooks are
 * fake. No OS child, native command, database or shared require hook is used. */
export function loadCuratedFirstpubCrashChild(
  filename: string, options: ForkOptions,
  ipc: { once: (event: string, listener: (message: unknown) => void) => unknown; send: (message: unknown) => void },
  dependencies: Readonly<Record<string, unknown>>,
) {
  const cwd = options.cwd;
  if (typeof cwd !== "string" || options.env === undefined) throw new Error("Explicit fork cwd/env required");
  const fakeProcess = {
    env: options.env, cwd: () => cwd, argv: [process.execPath, filename], execArgv: options.execArgv ?? [],
    versions: process.versions, version: process.version, platform: process.platform,
    stdout: { isTTY: false }, once: ipc.once, send: ipc.send,
  };
  const nodeRequire = createRequire(filename);
  const isolatedRoots = ["ts-node", "tsconfig-paths"].map((name) => dirname(nodeRequire.resolve(`${name}/package.json`)));
  const cache = new Map<string, TestModule>();
  const forbiddenProcess = () => { throw new Error("OS processes forbidden in loader regression"); };
  const extensions: Record<string, (mod: TestModule, file: string) => void> = {
    ".js": (mod, file) => mod._compile(readFileSync(file, "utf8"), file),
  };
  // The real preloads register their hooks on this private module facade.
  const moduleFacade = {
    createRequire, builtinModules,
    Module: { _preloadModules: (names: string[]) => { for (const name of names) load(nodeRequire.resolve(name)); } },
    _resolveFilename: (name: string, parent: { filename: string }) => createRequire(parent.filename).resolve(name),
  };
  let main: TestModule;
  const load = (file: string): unknown => {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const mod: TestModule = { exports: {}, filename: file, _compile: (code, source) => {
      const local = createRequire(source);
      const req = Object.assign((name: string): unknown => {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        if (name === "module" || name === "node:module") return moduleFacade;
        if (name === "child_process" || name === "node:child_process") return { fork: forbiddenProcess, spawnSync: forbiddenProcess };
        const resolved = moduleFacade._resolveFilename(name, mod);
        if (isolatedRoots.some((root) => resolved.startsWith(root + "/")) && extname(resolved) === ".js") return load(resolved);
        return local(resolved) as unknown;
      }, { resolve: local.resolve, extensions, main });
      const execute = runInNewContext(`(function(require,module,exports,__filename,__dirname){${code}\n})`, {
        process: fakeProcess, Buffer, console, setTimeout, clearTimeout, setImmediate,
      }, { filename: source }) as (req: unknown, mod: TestModule, exports: unknown, source: string, directory: string) => void;
      execute(req, mod, mod.exports, source, dirname(source));
    } };
    cache.set(file, mod);
    if (file === filename) main = mod;
    (extensions[extname(file)] ?? extensions[".js"]!)(mod, file);
    return mod.exports;
  };
  const args = options.execArgv ?? [];
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] !== "-r" || !args[i + 1]) throw new Error("Only explicit CJS preloads allowed");
    load(nodeRequire.resolve(args[i + 1]!));
  }
  load(filename);
  const service = Reflect.get(fakeProcess, Symbol.for("ts-node.register.instance")) as Service;
  return { project: service.options.project, rootDir: service.config.options.rootDir,
    transpileOnly: service.options.transpileOnly, entry: filename };
}
