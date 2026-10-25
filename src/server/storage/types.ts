export const DOCUMENTS_BUCKET = "qualification-documents";

export class StorageObjectNotFound extends Error {}

export type StoredObject = { path: string; createdAt: Date | null };

/** Private object storage for qualification documents. */
export interface FileStorage {
  put(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Throws StorageObjectNotFound when the object does not exist. */
  get(objectPath: string): Promise<Uint8Array>;
  /** Succeeds when the object is already gone. */
  remove(objectPath: string): Promise<void>;
  /** Every object under a top-level prefix ("org" or "worker"), recursively. */
  list(prefix: string): Promise<StoredObject[]>;
}
