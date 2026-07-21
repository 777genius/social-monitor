import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writePrivateJsonAtomically } from "./private-json-artifact";

describe("private JSON artifact writer", () => {
  it("creates and replaces complete 0400 JSON artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "private-json-artifact-"));
    const path = join(root, "nested", "report.json");

    writePrivateJsonAtomically({
      path,
      value: { version: 1, passed: false },
      replace: false,
    });
    expect(statSync(path).mode & 0o777).toBe(0o400);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      passed: false,
    });

    writePrivateJsonAtomically({
      path,
      value: { version: 2, passed: true },
      replace: true,
    });
    expect(statSync(path).mode & 0o777).toBe(0o400);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 2,
      passed: true,
    });
  });

  it("fails without replacing an existing capture target", () => {
    const root = mkdtempSync(join(tmpdir(), "private-json-exclusive-"));
    const path = join(root, "manifest.json");
    writePrivateJsonAtomically({ path, value: { version: 1 }, replace: false });

    expect(() =>
      writePrivateJsonAtomically({
        path,
        value: { version: 2 },
        replace: false,
      }),
    ).toThrow();
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 1 });
  });
});
