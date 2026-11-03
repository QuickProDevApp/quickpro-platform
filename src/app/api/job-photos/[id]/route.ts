import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getJobPhotoForView } from "@/server/data/job-photos";
import { fileStorage, StorageObjectNotFound } from "@/server/storage";
import { uuid } from "@/lib/schemas";

/**
 * Serves a job photo to someone allowed to see its record under row level
 * security (the business, staff, and the booked crew). Never a public URL.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const { id } = await params;
  if (!uuid.safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const photo = await getJobPhotoForView(user.id, id);
  if (!photo) return new NextResponse("Not found", { status: 404 });

  let bytes: Uint8Array;
  try {
    bytes = await fileStorage().get(photo.storage_path);
  } catch (error) {
    if (error instanceof StorageObjectNotFound) {
      console.error("Job photo row has no stored file", id, photo.storage_path);
      return new NextResponse("This photo's file is missing.", { status: 404 });
    }
    throw error;
  }
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": photo.mime_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      // Short private caching so the grid doesn't refetch on every visit; access is rechecked after.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
