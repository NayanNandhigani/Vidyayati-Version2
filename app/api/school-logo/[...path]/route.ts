import { NextResponse } from "next/server";
import { readUploadedFile } from "@/lib/storage";
import { detectLogoType, LOGO_DIR } from "@/lib/school-branding";

// Serves a school's logo for the portal header. Unauthenticated like the
// certificate and website assets (a logo isn't sensitive, and it also
// shows before a page's session check finishes). The path must be a
// random file name under the school's own folder, and only real
// PNG/JPEG/WebP bytes are served — checked from the file itself.
const SAFE_PATH = new RegExp(`^${LOGO_DIR}/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$`);

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const storagePath = segments.join("/");
  if (!SAFE_PATH.test(storagePath)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const bytes = await readUploadedFile(storagePath).catch(() => null);
  const type = bytes ? detectLogoType(bytes) : null;
  if (!bytes || !type) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type.contentType,
      "X-Content-Type-Options": "nosniff",
      // A new upload gets a new file name, so the old one can be cached for a long time.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
