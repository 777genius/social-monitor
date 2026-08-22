import {
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
  installSecureRecoveryEvidenceFile,
  readSecureRecoveryEvidenceFile,
} from "./reader-summary-recovery-evidence-secure-file";

describe("recovery evidence descriptor-anchored filesystem", () => {
  it("fails closed when a symlink replaces an input after it is opened", () => {
    const directory = secureTemporaryDirectory("evidence-leaf-symlink-");
    const input = join(directory, "input.json");
    const openedInput = join(directory, "opened-input.json");
    const malicious = join(directory, "malicious.json");
    writeFileSync(input, "exact\n", { mode: 0o400 });
    writeFileSync(malicious, "malicious\n", { mode: 0o400 });

    expect(() => readSecureRecoveryEvidenceFile({
      path: input,
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
    writeFileSync(input, "exact\n", { mode: 0o400 });

    expect(() => readSecureRecoveryEvidenceFile({
      path: input,
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
    const output = join(parent, "authority.json");

    expect(() => installSecureRecoveryEvidenceFile({
      path: output,
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

    expect(() => installSecureRecoveryEvidenceFile({
      path: output,
      label: "fixture authority",
      bytes: Buffer.from("exact\n"),
      checkpoint: (checkpoint) => {
        if (checkpoint !== "file_created") return;
        renameSync(output, movedOutput);
        writeFileSync(output, replacement, { mode: 0o400 });
      },
    })).toThrow("changed while it was installed");
    expect(readSecureRecoveryEvidenceFile({
      path: output,
      label: "replacement fixture",
    })).toEqual(replacement);
  });

  it("creates through O_EXCL and replays only exact secure bytes", () => {
    const directory = secureTemporaryDirectory("evidence-exact-replay-");
    const output = join(directory, "nested", "authority.json");
    const exact = Buffer.from("exact canonical bytes\n");

    expect(installSecureRecoveryEvidenceFile({
      path: output,
      label: "fixture authority",
      bytes: exact,
    })).toBe("installed");
    expect(installSecureRecoveryEvidenceFile({
      path: output,
      label: "fixture authority",
      bytes: exact,
    })).toBe("replayed");
    expect(readSecureRecoveryEvidenceFile({
      path: output,
      label: "fixture authority",
    })).toEqual(exact);
    expect(() => installSecureRecoveryEvidenceFile({
      path: output,
      label: "fixture authority",
      bytes: Buffer.from("divergent\n"),
    })).toThrow("different bytes");
  });
});

const secureTemporaryDirectory = (prefix: string): string => {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return path;
};
