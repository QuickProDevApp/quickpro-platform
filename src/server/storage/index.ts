import "server-only";
import { env } from "@/server/env";
import { createLocalStorage } from "./local-storage";
import { createSupabaseStorage } from "./supabase-storage";
import type { FileStorage } from "./types";

export type { FileStorage } from "./types";
export { StorageObjectNotFound } from "./types";

export function fileStorage(): FileStorage {
  const e = env();
  return e.FILE_STORAGE_DRIVER === "local"
    ? createLocalStorage(e.LOCAL_STORAGE_DIR)
    : createSupabaseStorage(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY!);
}
