import {
  chmodSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertImmutableRecoveryInputs } from "./reader-summary-recovery-files";

describe("immutable recovery inputs", () => {
  let directory = "";

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("accepts distinct read-only regular files inside the recovery root", () => {
    const [first, second] = fixtures();

    expect(
      assertImmutableRecoveryInputs({
        recoveryRoot: directory,
        inputPaths: [first, second],
        forbiddenOutputPaths: [],
      }),
    ).toHaveLength(2);
  });

  it("rejects writable input", () => {
    const [first] = fixtures();
    chmodSync(first, 0o600);

    expect(() => validate([first])).toThrow("immutable regular files");
  });

  it("rejects symlinks", () => {
    const [first] = fixtures();
    const link = join(directory, "link.json");
    symlinkSync(first, link);

    expect(() => validate([link])).toThrow("immutable regular files");
  });

  it("rejects duplicate aliases and files outside the recovery root", () => {
    const [first] = fixtures();
    expect(() => validate([first, first])).toThrow("must be distinct");

    const nested = join(directory, "nested");
    mkdirSync(nested);
    expect(() =>
      assertImmutableRecoveryInputs({
        recoveryRoot: nested,
        inputPaths: [first],
        forbiddenOutputPaths: [],
      }),
    ).toThrow("inside the recovery directory");
  });

  it("rejects a hard-link alias of a canonical production output", () => {
    const [first] = fixtures();
    const productionOutput = join(directory, "production-quality.json");
    const recoveryAlias = join(directory, "quality-recovery.json");
    writeFileSync(productionOutput, "{}\n", { mode: 0o600 });
    linkSync(productionOutput, recoveryAlias);
    chmodSync(recoveryAlias, 0o400);

    expect(() =>
      assertImmutableRecoveryInputs({
        recoveryRoot: directory,
        inputPaths: [first, recoveryAlias],
        forbiddenOutputPaths: [productionOutput],
      }),
    ).toThrow("aliases a production output");
  });

  it("rejects an output symlink whose realpath aliases a recovery input", () => {
    const [first] = fixtures();
    const outputAlias = join(directory, "production-output-link.json");
    symlinkSync(first, outputAlias);

    expect(() =>
      assertImmutableRecoveryInputs({
        recoveryRoot: directory,
        inputPaths: [first],
        forbiddenOutputPaths: [outputAlias],
      }),
    ).toThrow("aliases a production output");
  });

  function fixtures(): readonly [string, string] {
    directory = mkdtempSync(join(tmpdir(), "summary-recovery-"));
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    for (const path of [first, second]) {
      writeFileSync(path, "{}\n", { mode: 0o400 });
    }
    return [first, second];
  }

  function validate(inputPaths: readonly string[]) {
    return assertImmutableRecoveryInputs({
      recoveryRoot: directory,
      inputPaths,
      forbiddenOutputPaths: [],
    });
  }
});
