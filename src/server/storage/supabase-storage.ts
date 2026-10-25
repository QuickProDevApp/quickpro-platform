import { createClient } from "@supabase/supabase-js";
import { DOCUMENTS_BUCKET, StorageObjectNotFound, type FileStorage, type StoredObject } from "./types";

/** Supabase Storage, private bucket, reached only with the service role key from the server. */
export function createSupabaseStorage(url: string, serviceRoleKey: string, bucketName = DOCUMENTS_BUCKET): FileStorage {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = () => client.storage.from(bucketName);

  async function listFolder(prefix: string): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket().list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`Storage list failed: ${error.message}`);
      for (const entry of data) {
        const full = `${prefix}/${entry.name}`;
        // Folders come back without an id.
        if (entry.id === null) out.push(...(await listFolder(full)));
        else out.push({ path: full, createdAt: entry.created_at ? new Date(entry.created_at) : null });
      }
      if (data.length < 1000) return out;
    }
  }

  return {
    async put(objectPath, bytes, contentType) {
      const { error } = await bucket().upload(objectPath, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async get(objectPath) {
      const { data, error } = await bucket().download(objectPath);
      if (error || !data) {
        const status = (error as { status?: number; statusCode?: string } | null)?.status;
        if (status === 400 || status === 404 || /not.?found/i.test(error?.message ?? "")) {
          throw new StorageObjectNotFound(objectPath);
        }
        throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(objectPath) {
      const { error } = await bucket().remove([objectPath]);
      if (error) throw new Error(`Storage delete failed: ${error.message}`);
    },
    list: listFolder,
  };
}
