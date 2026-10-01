import { describe, expect, it } from "vitest";
import { isValidPinCode, maskAadhaar, normalizeAadhaar, normalizeApaarId, isIndianState, INDIAN_STATES_AND_UTS } from "@/lib/indian";
import { EMPTY_STUDENT_DETAILS, parseStudentDetails } from "@/lib/student-fields";

// The only valid Aadhaar ending for a prefix (Verhoeff check digit).
const validAadhaar = (prefix: string) => [..."0123456789"].map((d) => prefix + d).find((n) => normalizeAadhaar(n))!;

describe("Indian reference data", () => {
  it("lists 28 states and 8 union territories", () => expect(INDIAN_STATES_AND_UTS).toHaveLength(36));
  it("checks states", () => {
    expect(isIndianState("Karnataka")).toBe(true);
    expect(isIndianState("Queensland")).toBe(false);
  });
  it("PIN codes", () => {
    expect(isValidPinCode("560001")).toBe(true);
    expect(isValidPinCode("060001")).toBe(false);
    expect(isValidPinCode("56001")).toBe(false);
  });
  it("Aadhaar has exactly one valid check digit and is masked", () => {
    const n = validAadhaar("23412341234");
    expect([..."0123456789"].filter((d) => normalizeAadhaar("23412341234" + d))).toHaveLength(1);
    expect(normalizeAadhaar(`${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`)).toBe(n);
    expect(normalizeAadhaar("123412341234")).toBeNull(); // can't start with 1
    expect(maskAadhaar(n)).toBe(`XXXX XXXX ${n.slice(-4)}`);
  });
  it("APAAR ID is 12 digits", () => {
    expect(normalizeApaarId("1234 5678 9012")).toBe("123456789012");
    expect(normalizeApaarId("12345")).toBeNull();
  });
});

describe("parseStudentDetails", () => {
  const base = { ...EMPTY_STUDENT_DETAILS, firstName: "Aarav", surname: "Mehta" };
  it("accepts a minimal student (all new fields optional)", () => {
    const r = parseStudentDetails(base);
    expect(r.errors).toBeNull();
    expect(r.data).toMatchObject({ firstName: "Aarav", primaryMobile: null, aadhaarNumber: null, rteQuota: false });
  });
  it("rejects a future date of birth and bad fields, per field", () => {
    const r = parseStudentDetails({ ...base, dob: "2099-01-01", primaryMobile: "0412345678", pinCode: "12", aadhaarNumber: "1111", state: "Texas" });
    expect(Object.keys(r.errors ?? {}).sort()).toEqual(["aadhaarNumber", "dob", "pinCode", "primaryMobile", "state"]);
    expect(r.errors!.dob).toMatch(/future/);
  });
  it("cleans the mobile and Aadhaar before storing", () => {
    const n = validAadhaar("98765432109");
    const r = parseStudentDetails({ ...base, primaryMobile: "+91 98765 43210", aadhaarNumber: `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`, category: "OBC" });
    expect(r.data).toMatchObject({ primaryMobile: "9876543210", aadhaarNumber: n, category: "OBC" });
  });
  it("on edit, a blank Aadhaar keeps the saved one", () => {
    const r = parseStudentDetails(base, { keepAadhaarWhenEmpty: true });
    expect(r.data).not.toHaveProperty("aadhaarNumber");
  });
});
