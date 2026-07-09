import { existsSync, readFileSync } from "node:fs";

export function loadDotenvIfPresent(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  for (const [key, value] of Object.entries(parseDotenv(readFileSync(path)))) {
    process.env[key] ??= value;
  }
}

export function parseDotenv(buffer: Buffer): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of buffer.toString("utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match === null || match[1]?.startsWith("#")) {
      continue;
    }

    const key = match[1];
    if (key === undefined) {
      continue;
    }
    const rawValue = match[2]?.trim() ?? "";
    values[key] = unquoteDotenvValue(rawValue);
  }

  return values;
}

const unquoteDotenvValue = (value: string): string => {
  const quote = value[0];
  if (
    value.length >= 2 &&
    (quote === '"' || quote === "'") &&
    value[value.length - 1] === quote
  ) {
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/u, "").trim();
};
