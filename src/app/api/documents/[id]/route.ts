import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getDocumentForDownload } from "@/server/data/documents";
import { fileStorage } from "@/server/storage";
import { uuid } from "@/lib/schemas";

/**
 * Streams a qualification document to a user allowed to read its record under
 * row level security (org members, the worker, staff). Files are never served
 * from a public URL.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { id } = await params;
  if (!uuid.safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const doc = await getDocumentForDownload(user.id, id);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const bytes = await fileStorage().get(doc.storage_path);
  const fileName = doc.file_name.replace(/[^\w.\- ()]/g, "_");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
