import fs, { constants } from "node:fs";
import fsPromises from "node:fs/promises";
import { isAbsolute } from "node:path";

const systemdMimoKeyPath = /^\/run\/credentials\/[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}\.service\/mimo_key$/u;
const unavailable = () => new Error("MiMo Token Plan key file is unavailable");

// The service receives only a systemd credential path. The key is read for
// the admitted MiMo worker and is never placed in the product process env.
export async function readMimoApiKeyFile(path) {
  if (typeof path !== "string" || !isAbsolute(path) || !path.trim()) {
    throw new Error("MiMo Token Plan key file is not configured");
  }
  const systemdCopy = systemdMimoKeyPath.test(path);
  const handle = await fsPromises.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    .catch(() => { throw unavailable(); });
  try {
    const metadata = await handle.stat();
    const ownerOnly = (metadata.mode & 0o400) !== 0 && (metadata.mode & 0o077) === 0;
    const systemdReadable = systemdCopy && metadata.uid === 0 && metadata.gid === 0 &&
      (metadata.mode & 0o7777) === 0o440;
    if (!metadata.isFile() || (!ownerOnly && !systemdReadable) || metadata.nlink !== 1 ||
        metadata.size < 1 || metadata.size > 4096) {
      throw unavailable();
    }
    if (systemdReadable) {
      let parent = "/";
      for (const part of ["", ...path.split("/").slice(1, -1)]) {
        if (part) parent = parent === "/" ? `/${part}` : `${parent}/${part}`;
        const directory = await fsPromises.lstat(parent);
        if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0 ||
            directory.gid !== 0 || (directory.mode & 0o022) !== 0) throw unavailable();
        try {
          fs.accessSync(parent, constants.W_OK);
          throw unavailable();
        } catch (error) {
          if (error?.code !== "EACCES") throw error;
        }
      }
      fs.accessSync(path, constants.R_OK);
      try {
        fs.accessSync(path, constants.W_OK);
        throw unavailable();
      } catch (error) {
        if (error?.code !== "EACCES") throw error;
      }
    }
    const key = (await handle.readFile("utf8")).trim();
    if (!key || /[\r\n\0]/u.test(key)) {
      throw unavailable();
    }
    return key;
  } catch {
    throw unavailable();
  } finally {
    await handle.close();
  }
}
