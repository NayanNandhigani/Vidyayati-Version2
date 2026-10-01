import { describe, it, expect } from "vitest";
import { parseSchoolGeneral, normalizeSchoolPhone, matchIndianState } from "@/lib/school-fields";

const base = { name: "Nayan International", city: "Hyderabad", state: "Telangana", postalCode: "500001", affiliationBoard: "CBSE", affiliationNumber: "3630123", udiseCode: "36290100101", phone: "+91 98480 22338", email: "Office@School.in" };

describe("parseSchoolGeneral (BUG-27)", () => {
  it("accepts valid Indian school details and cleans them", () => {
    const r = parseSchoolGeneral(base, { state: null });
    expect(r.fieldErrors).toBeUndefined();
    expect(r.data).toMatchObject({ state: "Telangana", postalCode: "500001", udiseCode: "36290100101", phone: "9848022338", email: "office@school.in" });
  });

  it("rejects a bad PIN, UDISE, board, state, phone and email with field messages", () => {
    const r = parseSchoolGeneral({ ...base, postalCode: "012345", udiseCode: "1234", affiliationBoard: "Cambridge", state: "Atlantis", phone: "12345", email: "nope" }, { state: null });
    expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["affiliationBoard", "email", "phone", "postalCode", "state", "udiseCode"]);
    expect(r.values.postalCode).toBe("012345"); // input kept for the form
  });

  it("keeps a free-text state saved before the dropdown existed", () => {
    expect(parseSchoolGeneral({ ...base, state: "TS" }, { state: "TS" }).fieldErrors).toBeUndefined();
  });

  it("allows the optional fields to be blank and requires a name", () => {
    const r = parseSchoolGeneral({ name: "" }, { state: null });
    expect(r.fieldErrors).toEqual({ name: "School name is required." });
    const ok = parseSchoolGeneral({ name: "X" }, { state: null });
    expect(ok.data).toMatchObject({ city: null, state: null, phone: null, email: null, udiseCode: null });
  });
});

describe("school phone and state helpers", () => {
  it("takes mobiles and STD landlines", () => {
    expect(normalizeSchoolPhone("098480 22338")).toBe("9848022338");
    expect(normalizeSchoolPhone("040 2345 6789")).toBe("04023456789");
    expect(normalizeSchoolPhone("+91 40 2345 6789")).toBe("04023456789");
    expect(normalizeSchoolPhone("12345")).toBeNull();
  });
  it("matches stored states case-insensitively", () => {
    expect(matchIndianState("telangana")).toBe("Telangana");
    expect(matchIndianState("TS")).toBe("TS");
  });
});
