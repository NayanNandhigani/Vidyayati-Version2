import { describe, it, expect } from "vitest";
import { detectLogoType, logoFileError, logoUrl, roleLabel, schoolInitials, schoolSubtitle, MAX_LOGO_BYTES } from "@/lib/school-branding";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("school logo files", () => {
  it("recognises PNG, JPEG and WebP from their bytes", () => {
    expect(detectLogoType(PNG)?.contentType).toBe("image/png");
    expect(detectLogoType(JPG)?.ext).toBe("jpg");
    expect(detectLogoType(WEBP)?.ext).toBe("webp");
  });
  it("refuses SVG and other files whatever they are called", () => {
    expect(detectLogoType(SVG)).toBeNull();
    expect(logoFileError(SVG)).toBe("The logo must be a PNG, JPG or WebP image.");
    expect(logoFileError(new TextEncoder().encode("%PDF-1.7"))).toMatch(/PNG, JPG or WebP/);
  });
  it("refuses empty and oversized files", () => {
    expect(logoFileError(new Uint8Array())).toMatch(/Choose an image/);
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(PNG);
    expect(logoFileError(big)).toBe("The logo must be 1 MB or smaller.");
    expect(logoFileError(PNG)).toBeNull();
  });
  it("builds the logo URL only when there is a logo", () => {
    expect(logoUrl(null)).toBeNull();
    expect(logoUrl("school-logos/s1/abc-logo.png")).toBe("/api/school-logo/school-logos/s1/abc-logo.png");
  });
});

describe("header text", () => {
  it("takes up to two initials, skipping little words", () => {
    expect(schoolInitials("Nayan International School")).toBe("NI");
    expect(schoolInitials("The School of Arts")).toBe("SA");
    expect(schoolInitials("st. mary's")).toBe("SM");
    expect(schoolInitials("Vidyalaya")).toBe("V");
    expect(schoolInitials("  ")).toBe("S");
  });
  it("shows only the parts of the place and board that are filled in", () => {
    expect(schoolSubtitle({ city: "Hyderabad", state: "Telangana", affiliationBoard: "CBSE" })).toBe("Hyderabad, Telangana · CBSE");
    expect(schoolSubtitle({ city: null, state: "Telangana", affiliationBoard: null })).toBe("Telangana");
    expect(schoolSubtitle({ city: "", state: null, affiliationBoard: "ICSE" })).toBe("ICSE");
    expect(schoolSubtitle({})).toBe("");
  });
  it("names each role", () => {
    expect([roleLabel("SCHOOL_ADMIN"), roleLabel("STAFF"), roleLabel("PARENT")]).toEqual(["School Admin", "Staff", "Parent"]);
  });
});
