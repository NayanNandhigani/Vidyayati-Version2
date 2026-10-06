// What the school portal header shows: the school's logo (or its initials
// until one is uploaded), its name, and a short line with city, state and
// board. Shared by the header, Settings → General and the logo route.

/** Largest logo a school can upload — under Next.js's 1 MB limit for a server action's request. */
export const MAX_LOGO_BYTES = 1_000_000;

/** Storage folder for a school's logo; the logo route only serves paths under it. */
export const LOGO_DIR = "school-logos";

export type LogoType = { ext: "png" | "jpg" | "webp"; contentType: string };

/**
 * The image type from the file's own bytes, not its name. Only PNG, JPEG
 * and WebP are accepted: an SVG can carry script, and the logo is served
 * from the app's own domain.
 */
export function detectLogoType(bytes: Uint8Array): LogoType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", contentType: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", contentType: "image/webp" };
  return null;
}

/** Why a file can't be used as the logo, or null when it can. */
export function logoFileError(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "Choose an image file to upload.";
  if (bytes.length > MAX_LOGO_BYTES) return "The logo must be 1 MB or smaller.";
  if (!detectLogoType(bytes)) return "The logo must be a PNG, JPG or WebP image.";
  return null;
}

export function logoUrl(logoPath: string | null | undefined): string | null {
  return logoPath ? `/api/school-logo/${logoPath}` : null;
}

/** Up to two initials for the badge shown until a logo is uploaded: "Nayan International School" → "NI". */
export function schoolInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !/^(of|the|and|&)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "S").slice(0, 2);
}

/** "Hyderabad, Telangana · CBSE" — only the parts the school has filled in. */
export function schoolSubtitle(s: { city?: string | null; state?: string | null; affiliationBoard?: string | null }): string {
  const place = [s.city, s.state].map((v) => v?.trim()).filter(Boolean).join(", ");
  return [place, s.affiliationBoard?.trim()].filter(Boolean).join(" · ");
}

export function roleLabel(role: "SCHOOL_ADMIN" | "STAFF" | "PARENT"): string {
  return role === "SCHOOL_ADMIN" ? "School Admin" : role === "STAFF" ? "Staff" : "Parent";
}
