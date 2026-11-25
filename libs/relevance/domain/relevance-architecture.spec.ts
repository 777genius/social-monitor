import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const relevanceDomainRoot = join(__dirname);

describe("Relevance domain architecture", () => {
  it("keeps ranking policy independent from Feed provider-native models", () => {
    const files = listTypeScriptFiles(join(relevanceDomainRoot, "policies"));
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");

      return source.includes("@social-monitor/feed") ? [file] : [];
    });

    expect(violations).toEqual([]);
  });
});

const listTypeScriptFiles = (dir: string): readonly string[] => {
  const entries = readdirSync(dir);

  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return listTypeScriptFiles(path);
    }

    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });
};
