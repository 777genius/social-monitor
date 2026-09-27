import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

// The service receives only a systemd credential path. The key is read for
// the admitted MiMo worker and is never placed in the product process env.
export async function readMimoApiKeyFile(path) {
  if (typeof path !== "string" || !isAbsolute(path) || !path.trim()) {
    throw new Error("MiMo Token Plan key file is not configured");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    .catch(() => { throw new Error("MiMo Token Plan key file is unavailable"); });
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0 ||
        metadata.size < 1 || metadata.size > 4096) {
      throw new Error("MiMo Token Plan key file is unavailable");
    }
    const key = (await handle.readFile("utf8")).trim();
    if (!key || /[\r\n\0]/u.test(key)) {
      throw new Error("MiMo Token Plan key file is unavailable");
    }
    return key;
  } catch {
    throw new Error("MiMo Token Plan key file is unavailable");
  } finally {
    await handle.close();
  }
}
