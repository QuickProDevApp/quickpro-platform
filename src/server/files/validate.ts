export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

const EXTENSIONS: Record<AllowedMime, "pdf" | "jpg" | "png"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Identifies the file type from its leading bytes. Browsers' declared types and file names are not trusted. */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

export type ValidatedFile = {
  mime: AllowedMime;
  extension: "pdf" | "jpg" | "png";
  size: number;
  fileName: string;
};

export type FileValidationResult = { ok: true; file: ValidatedFile } | { ok: false; error: string };

/** Keeps a display name only: strips paths and control characters, caps length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "document").slice(0, 255);
}

export function validateDocument(name: string, bytes: Uint8Array): FileValidationResult {
  if (bytes.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return { ok: false, error: "Files can be at most 10 MB." };
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, error: "Upload a PDF, JPEG or PNG file." };
  return {
    ok: true,
    file: { mime, extension: EXTENSIONS[mime], size: bytes.byteLength, fileName: sanitizeFileName(name) },
  };
}
