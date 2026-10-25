import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, sanitizeFileName, sniffMime, validateDocument } from "./validate";

const pdf = new TextEncoder().encode("%PDF-1.7\n...");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe("sniffMime", () => {
  it("recognizes PDF, PNG and JPEG by signature", () => {
    expect(sniffMime(pdf)).toBe("application/pdf");
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(jpeg)).toBe("image/jpeg");
  });

  it("rejects HTML and executables even when named like a PDF", () => {
    expect(validateDocument("coi.pdf", new TextEncoder().encode("<html><script>"))).toEqual({
      ok: false,
      error: "Upload a PDF, JPEG or PNG file.",
    });
    expect(sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });
});

describe("validateDocument", () => {
  it("rejects empty and oversized files", () => {
    expect(validateDocument("a.pdf", new Uint8Array())).toMatchObject({ ok: false });
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    big.set(pdf);
    expect(validateDocument("a.pdf", big)).toEqual({ ok: false, error: "Files can be at most 10 MB." });
  });

  it("derives the extension from content, not the name", () => {
    expect(validateDocument("photo.pdf", png)).toEqual({
      ok: true,
      file: { mime: "image/png", extension: "png", size: png.byteLength, fileName: "photo.pdf" },
    });
  });
});

describe("sanitizeFileName", () => {
  it("drops directories and unsafe characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\COI 2026<final>.pdf")).toBe("COI 2026final.pdf");
    expect(sanitizeFileName("   ")).toBe("document");
  });
});
