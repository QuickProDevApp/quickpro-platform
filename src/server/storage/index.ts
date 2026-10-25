import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/server/env";

export const DOCUMENTS_BUCKET = "qualification-documents";

export interface FileStorage {
  put(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(objectPath: string): Promise<Uint8Array>;
  remove(objectPath: string): Promise<void>;
}

/** Supabase Storage, private bucket, accessed only with the service role key from the server. */
function supabaseStorage(): FileStorage {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  const client = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = () => client.storage.from(DOCUMENTS_BUCKET);
  return {
    async put(objectPath, bytes, contentType) {
      const { error } = await bucket().upload(objectPath, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async get(objectPath) {
      const { data, error } = await bucket().download(objectPath);
      if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(objectPath) {
      const { error } = await bucket().remove([objectPath]);
      if (error) throw new Error(`Storage delete failed: ${error.message}`);
    },
  };
}

/** Development-only: files on local disk outside the web root. Refused in production by env(). */
function localStorage(): FileStorage {
  const root = path.resolve(env().LOCAL_STORAGE_DIR);
  const resolve = (objectPath: string) => {
    const full = path.resolve(root, objectPath);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage path.");
    return full;
  };
  return {
    async put(objectPath, bytes) {
      const full = resolve(objectPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes, { flag: "wx" });
    },
    async get(objectPath) {
      return new Uint8Array(await readFile(resolve(objectPath)));
    },
    async remove(objectPath) {
      await rm(resolve(objectPath), { force: true });
    },
  };
}

export function fileStorage(): FileStorage {
  return env().FILE_STORAGE_DRIVER === "local" ? localStorage() : supabaseStorage();
}
