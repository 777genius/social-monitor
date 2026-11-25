import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPrivateOpenAiApiKeyFile } from "./openai-api-key-file";
import { resolveOpenAiApiKey } from "./openai-api-key-source";

describe("OpenAI credential source and private file boundary", () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "sm-openai-key-fixture-"));
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("prioritizes direct env credentials without touching an invalid file", () => {
    expect(resolveOpenAiApiKey({
      OPENAI_API_KEY: "  synthetic-value  ",
      OPENAI_API_KEY_FILE: join(fixtureDir, "missing"),
    })).toBe("synthetic-value");
    expect(resolveOpenAiApiKey({})).toBe("");
  });

  it("accepts a private file, trims only its content, and does not read env itself", () => {
    const keyFile = join(fixtureDir, "provider-key");
    writeFileSync(keyFile, "  synthetic-file-value\n", { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    expect(readPrivateOpenAiApiKeyFile(keyFile)).toBe("synthetic-file-value");
    expect(resolveOpenAiApiKey({ OPENAI_API_KEY_FILE: `  ${keyFile}  ` }))
      .toBe("synthetic-file-value");
  });

  it("fails closed on missing files and directories with unchanged errors", () => {
    expect(() => readPrivateOpenAiApiKeyFile(join(fixtureDir, "missing")))
      .toThrow("OPENAI_API_KEY_FILE does not exist");
    expect(() => resolveOpenAiApiKey({ OPENAI_API_KEY_FILE: fixtureDir }))
      .toThrow("OPENAI_API_KEY_FILE must point at a file");
  });

  it("refuses group/world-readable credentials before reading them", () => {
    const keyFile = join(fixtureDir, "world-readable");
    writeFileSync(keyFile, "synthetic-file-value", { mode: 0o600 });
    chmodSync(keyFile, 0o644);
    expect(() => readPrivateOpenAiApiKeyFile(keyFile))
      .toThrow("OPENAI_API_KEY_FILE must use private 0600-style permissions");
  });
});
