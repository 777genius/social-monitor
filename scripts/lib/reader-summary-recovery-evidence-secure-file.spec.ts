import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRecoveryEvidenceFilesystemTestHarness,
  recoveryEvidenceEffectiveUserId,
  recoveryEvidenceRoot,
  resolveRecoveryEvidencePath,
} from "./reader-summary-recovery-evidence-secure-file";

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
