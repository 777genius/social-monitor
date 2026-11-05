import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve from the launcher's directory, matching installation inspection.
const localRequire = createRequire(import.meta.url);
const loadFromPackage = async (packageName, modulePath) => {
  const packageRoot = dirname(localRequire.resolve(`${packageName}/package.json`));
  return import(pathToFileURL(join(packageRoot, modulePath)).href);
};

export const loadInstalledSubscriptionRuntimeCli = () => loadFromPackage(
  "@vioxen/subscription-runtime", "dist/worker-local/agent-task-runner-cli.js",
);

export const loadInstalledMimoAppServerProcess = () => loadFromPackage(
  "@vioxen/subscription-runtime-mimo",
  "dist/provider-codex/app-server/adapters/node-app-server-process.js",
);
