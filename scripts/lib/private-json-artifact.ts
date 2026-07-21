import {
  chmodSync,
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";

export function writePrivateJsonAtomically(params: {
  readonly path: string;
  readonly value: unknown;
  readonly replace: boolean;
}): void {
  mkdirSync(dirname(params.path), { recursive: true, mode: 0o700 });
  const temporaryPath = join(
    dirname(params.path),
    `.${basename(params.path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(params.value, null, 2)}\n`, {
      encoding: "utf8",
    });
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporaryPath, 0o400);
    if (params.replace) {
      renameSync(temporaryPath, params.path);
    } else {
      linkSync(temporaryPath, params.path);
      rmSync(temporaryPath);
    }
    chmodSync(params.path, 0o400);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}
