import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { StorageObjectNotFound, type FileStorage, type StoredObject } from "./types";

/** Development-only storage on local disk, outside the web root. */
export function createLocalStorage(rootDir: string): FileStorage {
  const root = path.resolve(rootDir);
  const resolve = (objectPath: string) => {
    const full = path.resolve(root, objectPath);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage path.");
    return full;
  };

  async function walk(dir: string): Promise<StoredObject[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const out: StoredObject[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else out.push({ path: path.relative(root, full).split(path.sep).join("/"), createdAt: (await stat(full)).mtime });
    }
    return out;
  }

  return {
    async put(objectPath, bytes) {
      const full = resolve(objectPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes, { flag: "wx" });
    },
    async get(objectPath) {
      try {
        return new Uint8Array(await readFile(resolve(objectPath)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageObjectNotFound(objectPath);
        throw error;
      }
    },
    async remove(objectPath) {
      await rm(resolve(objectPath), { force: true });
    },
    list: (prefix) => walk(resolve(prefix)),
  };
}
