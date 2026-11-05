import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type * as NodeFilesystem from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRecoveryEvidenceFilesystemTestHarness,
  recoveryEvidenceEffectiveUserId,
  recoveryEvidenceRoot,
  resolveRecoveryEvidencePath,
} from "./reader-summary-recovery-evidence-secure-file";

const fs = jest.requireActual<typeof NodeFilesystem>("node:fs");

describe("recovery evidence descriptor-anchored filesystem", () => {
  it("fails closed when a symlink replaces an input after it is opened", () => {
    const directory = secureTemporaryDirectory("evidence-leaf-symlink-");
    const input = join(directory, "input.json");
    const openedInput = join(directory, "opened-input.json");
    const malicious = join(directory, "malicious.json");
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(directory);
    writeFileSync(input, "exact\n", { mode: 0o400 });
    writeFileSync(malicious, "malicious\n", { mode: 0o400 });

    expect(() => filesystem.read({
      relativePath: "input.json",
      label: "fixture input",
      checkpoint: (checkpoint) => {
        if (checkpoint !== "file_opened") return;
        renameSync(input, openedInput);
        symlinkSync(malicious, input);
      },
    })).toThrow("changed while it was read");
  });

  it("fails closed when a regular file replaces an input during its read", () => {
    const directory = secureTemporaryDirectory("evidence-leaf-replace-");
    const input = join(directory, "input.json");
    const openedInput = join(directory, "opened-input.json");
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(directory);
    writeFileSync(input, "exact\n", { mode: 0o400 });

    expect(() => filesystem.read({
      relativePath: "input.json",
      label: "fixture input",
      checkpoint: (checkpoint) => {
        if (checkpoint !== "file_read") return;
        renameSync(input, openedInput);
        writeFileSync(input, "replacement\n", { mode: 0o400 });
      },
    })).toThrow("changed while it was read");
  });

  it("fails closed when the validated parent chain is replaced", () => {
    const directory = secureTemporaryDirectory("evidence-parent-swap-");
    const parent = join(directory, "trusted");
    const movedParent = join(directory, "moved-trusted");
    const outside = join(directory, "outside");
    mkdirSync(parent, { mode: 0o700 });
    mkdirSync(outside, { mode: 0o700 });
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(parent);

    expect(() => filesystem.install({
      relativePath: "authority.json",
      label: "fixture authority",
      bytes: Buffer.from("exact\n"),
      checkpoint: (checkpoint) => {
        if (checkpoint !== "parent_opened") return;
        renameSync(parent, movedParent);
        symlinkSync(outside, parent, "dir");
      },
    })).toThrow(/symbolic link|parent directory changed/u);
    expect(existsSync(join(outside, "authority.json"))).toBe(false);
    expect(existsSync(join(movedParent, "authority.json"))).toBe(false);
  });

  it("does not accept or delete a replacement of its exclusive output", () => {
    const directory = secureTemporaryDirectory("evidence-output-replace-");
    const output = join(directory, "authority.json");
    const movedOutput = join(directory, "opened-authority.json");
    const replacement = Buffer.from("replacement\n");
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(directory);

    expect(() => filesystem.install({
      relativePath: "authority.json",
      label: "fixture authority",
      bytes: Buffer.from("exact\n"),
      checkpoint: (checkpoint) => {
        if (checkpoint !== "file_created") return;
        renameSync(output, movedOutput);
        writeFileSync(output, replacement, { mode: 0o400 });
      },
    })).toThrow("changed while it was installed");
    expect(filesystem.read({
      relativePath: "authority.json",
      label: "replacement fixture",
    })).toEqual(replacement);
  });

  it("creates through O_EXCL and replays only exact secure bytes", () => {
    const directory = secureTemporaryDirectory("evidence-exact-replay-");
    const exact = Buffer.from("exact canonical bytes\n");
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(directory);

    expect(filesystem.install({
      relativePath: "nested/authority.json",
      label: "fixture authority",
      bytes: exact,
    })).toBe("installed");
    expect(filesystem.install({
      relativePath: "nested/authority.json",
      label: "fixture authority",
      bytes: exact,
    })).toBe("replayed");
    expect(filesystem.read({
      relativePath: "nested/authority.json",
      label: "fixture authority",
    })).toEqual(exact);
    expect(() => filesystem.install({
      relativePath: "nested/authority.json",
      label: "fixture authority",
      bytes: Buffer.from("divergent\n"),
    })).toThrow("different bytes");
  });

  it("normalizes a restrictive umask before validating the new file", () => {
    const directory = secureTemporaryDirectory("evidence-restrictive-umask-");
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(directory);
    const exact = Buffer.from("exact canonical bytes\n");
    const previousUmask = process.umask(0o777);
    try {
      expect(filesystem.install({
        relativePath: "authority.json",
        label: "fixture authority",
        bytes: exact,
      })).toBe("installed");
    } finally {
      process.umask(previousUmask);
    }
    expect(statSync(join(directory, "authority.json")).mode & 0o7777).toBe(0o400);
    expect(filesystem.read({
      relativePath: "authority.json",
      label: "fixture authority",
    })).toEqual(exact);
  });

  it("fixes production evidence to the uid-1000 artifact root", () => {
    expect(recoveryEvidenceRoot).toBe("/var/lib/social-monitor/artifacts");
    expect(recoveryEvidenceEffectiveUserId).toBe(1000);
    expect(resolveRecoveryEvidencePath("bounded/input.json")).toBe(
      "/var/lib/social-monitor/artifacts/bounded/input.json",
    );
    for (const path of [
      "/tmp/input.json",
      "../input.json",
      "bounded/../input.json",
      "bounded//input.json",
    ]) {
      expect(() => resolveRecoveryEvidencePath(path)).toThrow();
    }
  });

  it("rejects unsafe root and input permissions", () => {
    const directory = secureTemporaryDirectory("evidence-permissions-");
    const filesystem = createRecoveryEvidenceFilesystemTestHarness(directory);
    const input = join(directory, "input.json");
    writeFileSync(input, "exact\n", { mode: 0o600 });
    expect(() => filesystem.read({
      relativePath: "input.json",
      label: "fixture input",
    })).toThrow("permissions must be exactly 0400");

    chmodSync(input, 0o400);
    chmodSync(directory, 0o750);
    expect(() => filesystem.read({
      relativePath: "input.json",
      label: "fixture input",
    })).toThrow("directory permissions must be exactly 0700");
  });
});

const secureTemporaryDirectory = (prefix: string): string => {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return path;
};

describe("recovery evidence directory durability", () => {
  let root: string;
  const relativePath = "reader-summary-ready-recovery/operation/events/claim.json";
  const bytes = Buffer.from("permanent synthetic claim\n");
  beforeEach(() => { root = secureTemporaryDirectory("evidence-fsync-"); });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const install = () => createRecoveryEvidenceFilesystemTestHarness(root).install({
    relativePath, label: "fixture claim", bytes,
  });

  it("syncs the entire new directory chain before creating a claim", () => {
    const trace = traceEvidenceFilesystem(root);
    expect(install()).toBe("installed");
    const paths = [root, join(root, "reader-summary-ready-recovery"),
      join(root, "reader-summary-ready-recovery/operation"),
      join(root, "reader-summary-ready-recovery/operation/events")];
    expect(trace.events.filter(event => event.startsWith("sync:"))).toEqual([
      ...paths.slice(0, -1).map(path => `sync:${path}`),
      `sync:${join(root, relativePath)}`, `sync:${paths[3]}`,
    ]);
    for (let index = 1; index < paths.length; index++) {
      const child = paths[index]!;
      const parent = paths[index - 1]!;
      expect(trace.events.indexOf(`mkdir:${child}`)).toBeLessThan(
        trace.events.indexOf(`open:${child}`),
      );
      expect(trace.events.indexOf(`open:${child}`)).toBeLessThan(
        trace.events.indexOf(`sync:${parent}`),
      );
      expect(trace.events.indexOf(`sync:${parent}`)).toBeLessThan(
        trace.events.indexOf(`close:${parent}`),
      );
      expect(trace.events.indexOf(`sync:${parent}`)).toBeLessThan(
        trace.events.indexOf(index + 1 < paths.length
          ? `mkdir:${paths[index + 1]}` : `open:${join(root, relativePath)}`),
      );
      expect(statSync(child).mode & 0o7777).toBe(0o700);
    }
    expect(fs.readFileSync(join(root, relativePath))).toEqual(bytes);
    expect(statSync(join(root, relativePath)).mode & 0o7777).toBe(0o400);
    expect(trace.openDescriptors.size).toBe(0);
  });

  it("anchors directories already visible from an unfinished sibling creator", () => {
    mkdirSync(join(root, "reader-summary-ready-recovery/operation/events"), {
      recursive: true, mode: 0o700,
    });
    const trace = traceEvidenceFilesystem(root);
    expect(install()).toBe("installed");
    expect(trace.events.filter(event => event.startsWith("mkdir:"))).toEqual([]);
    expect(trace.events.filter(event => event.startsWith("sync:")).slice(0, 3)).toEqual([
      `sync:${root}`, `sync:${join(root, "reader-summary-ready-recovery")}`,
      `sync:${join(root, "reader-summary-ready-recovery/operation")}`,
    ]);
    expect(trace.events.indexOf(`sync:${join(root, "reader-summary-ready-recovery/operation")}`))
      .toBeLessThan(trace.events.indexOf(`open:${join(root, relativePath)}`));
  });

  it("opens and syncs the exact parent after a concurrent mkdir EEXIST", () => {
    const realMkdir = fs.mkdirSync;
    const trace = traceEvidenceFilesystem(root, {
      beforeMkdir: path => { realMkdir(path, { mode: 0o700 }); },
    });
    expect(install()).toBe("installed");
    expect(trace.events.filter(event => event.startsWith("sync:")).slice(0, 3)).toEqual([
      `sync:${root}`, `sync:${join(root, "reader-summary-ready-recovery")}`,
      `sync:${join(root, "reader-summary-ready-recovery/operation")}`,
    ]);
    expect(trace.openDescriptors.size).toBe(0);
  });

  it.each(["", "reader-summary-ready-recovery", "reader-summary-ready-recovery/operation"])(
    "fails closed and closes both descriptors when parent fsync fails at %s", failedParent => {
      const trace = traceEvidenceFilesystem(root, { failSync: join(root, failedParent) });
      expect(install).toThrow("synthetic directory fsync failure");
      expect(existsSync(join(root, relativePath))).toBe(false);
      expect(trace.events).not.toContain(`open:${join(root, relativePath)}`);
      expect(trace.openDescriptors.size).toBe(0);
    },
  );

  it("fails closed when a concurrent creator's parent cannot be synced", () => {
    const realMkdir = fs.mkdirSync;
    const trace = traceEvidenceFilesystem(root, {
      beforeMkdir: path => { realMkdir(path, { mode: 0o700 }); }, failSync: root,
    });
    expect(install).toThrow("synthetic directory fsync failure");
    expect(existsSync(join(root, relativePath))).toBe(false);
    expect(trace.openDescriptors.size).toBe(0);
  });

  it.each(["symlink", "permissions"])("rejects an EEXIST %s before syncing or advancing", risk => {
    const realMkdir = fs.mkdirSync;
    const trace = traceEvidenceFilesystem(root, {
      beforeMkdir: path => {
        if (risk === "symlink") symlinkSync(root, path, "dir");
        else { realMkdir(path, { mode: 0o700 }); chmodSync(path, 0o750); }
      },
    });
    expect(install).toThrow(risk === "symlink"
      ? /symbolic link|non-directory/u : /permissions must be exactly 0700/u);
    expect(trace.events.filter(event => event.startsWith("sync:"))).toEqual([]);
    expect(existsSync(join(root, relativePath))).toBe(false);
    expect(trace.openDescriptors.size).toBe(0);
  });

  it("retries a failed directory sync before accepting a subsequent installation", () => {
    traceEvidenceFilesystem(root, { failSync: root });
    expect(install).toThrow("synthetic directory fsync failure");
    jest.restoreAllMocks();
    const trace = traceEvidenceFilesystem(root);
    expect(install()).toBe("installed");
    expect(trace.events).not.toContain(`mkdir:${join(root, "reader-summary-ready-recovery")}`);
    expect(trace.events).toContain(`sync:${root}`);
    expect(trace.openDescriptors.size).toBe(0);
  });
});

// Real Linux filesystem calls with deterministic interleavings/failures; no power-loss simulation.
const traceEvidenceFilesystem = (root: string, options: {
  readonly failSync?: string;
  readonly beforeMkdir?: (path: NodeFilesystem.PathLike) => void;
} = {}) => {
  const realOpen = fs.openSync;
  const realClose = fs.closeSync;
  const realMkdir = fs.mkdirSync;
  const realFsync = fs.fsyncSync;
  const events: string[] = [];
  const openDescriptors = new Set<number>();
  const descriptorPath = (descriptor: number) => fs.readlinkSync(`/proc/self/fd/${descriptor}`);
  const record = (operation: string, path: string) => {
    if (path === root || path.startsWith(`${root}/`)) events.push(`${operation}:${path}`);
  };
  jest.spyOn(fs, "openSync").mockImplementation((path, flags, mode) => {
    const descriptor = realOpen(path, flags, mode);
    openDescriptors.add(descriptor);
    record("open", descriptorPath(descriptor));
    return descriptor;
  });
  jest.spyOn(fs, "closeSync").mockImplementation(descriptor => {
    record("close", descriptorPath(descriptor));
    realClose(descriptor);
    openDescriptors.delete(descriptor);
  });
  jest.spyOn(fs, "mkdirSync").mockImplementation((path, mkdirOptions) => {
    options.beforeMkdir?.(path);
    const result = realMkdir(path, mkdirOptions);
    record("mkdir", fs.realpathSync(path));
    return result;
  });
  jest.spyOn(fs, "fsyncSync").mockImplementation(descriptor => {
    const path = descriptorPath(descriptor);
    record("sync", path);
    if (path === options.failSync) {
      throw Object.assign(new Error("synthetic directory fsync failure"), { code: "EIO" });
    }
    realFsync(descriptor);
  });
  return { events, openDescriptors };
};
