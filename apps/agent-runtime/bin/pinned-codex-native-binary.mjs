import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// The npm-installed Linux packages used by the Node Docker image. Resolve from
// the app installation, never the task cwd, PATH, or a host-global Codex install.
export function resolvePinnedCodexBinaryPath({
  appPackageJson = new URL("../../../package.json", import.meta.url),
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const target = platform === "linux"
    ? { x64: "x86_64-unknown-linux-musl", arm64: "aarch64-unknown-linux-musl" }[arch]
    : undefined;
  if (target === undefined) {
    throw new Error("Pinned Codex native executable requires Linux x64 or arm64");
  }
  const appRequire = createRequire(appPackageJson);
  const codexRequire = createRequire(appRequire.resolve("@openai/codex/package.json"));
  const nativePackage = codexRequire.resolve(`@openai/codex-linux-${arch}/package.json`);
  // Do not realpath the executable: the quota adapter must reject final symlinks
  // with O_NOFOLLOW and validate the direct ELF itself.
  return join(dirname(nativePackage), "vendor", target, "bin", "codex");
}
