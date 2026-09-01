import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openSecureDirectory } from
  "./reader-summary-promotion-v2-secure-directory";

describe("historical Promotion V2 secure output directory", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "promotion-v2-secure-output-"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("keeps output fd-relative after the named path is replaced", () => {
    const output = join(root, "output");
    const displaced = join(root, "displaced");
    mkdirSync(output);
    const handle = openSecureDirectory(output);
    try {
      renameSync(output, displaced);
      mkdirSync(output);
      writeFileSync(join(handle.fdPath, "receipt.json"), "bound-to-open-fd");

      expect(readFileSync(join(displaced, "receipt.json"), "utf8"))
        .toBe("bound-to-open-fd");
      expect(() => readFileSync(join(output, "receipt.json"), "utf8"))
        .toThrow();
    } finally {
      handle.close();
    }
  });

  it("rejects a symlinked output directory without following it", () => {
    const authority = join(root, "authority");
    const linked = join(root, "linked");
    mkdirSync(authority);
    symlinkSync(authority, linked);

    expect(() => openSecureDirectory(linked)).toThrow("not canonical");
  });
});
