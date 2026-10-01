import { describe, it, expect } from "vitest";
import { describeAuditChanges } from "@/lib/audit-labels";
import { formatDateTimeIST, istDayStart } from "@/lib/ist";

describe("describeAuditChanges (BUG-24)", () => {
  it("labels fields and resolves ids to names", () => {
    const names = new Map([["staff1", "Asha Rao"], ["staff2", "Ravi Kumar"]]);
    const lines = describeAuditChanges("UPDATE", { classTeacherStaffId: { before: "staff1", after: "staff2" }, updatedAt: { before: "x", after: "y" } }, names);
    expect(lines).toEqual([{ field: "Class teacher", before: "Asha Rao", after: "Ravi Kumar" }]);
  });

  it("formats money, booleans, empty values and masks Aadhaar", () => {
    const lines = describeAuditChanges("UPDATE", {
      amount: { before: "1500", after: "32600" },
      isAbsent: { before: "false", after: "true" },
      surname: { before: "null", after: "Sharma" },
      aadhaarNumber: { before: "null", after: "234123412346" },
    });
    expect(lines).toEqual([
      { field: "Amount", before: "₹1,500", after: "₹32,600" },
      { field: "Absent", before: "No", after: "Yes" },
      { field: "Surname", before: "—", after: "Sharma" },
      { field: "Aadhaar", before: "—", after: "XXXX XXXX 2346" },
    ]);
  });

  it("lists a deleted record's fields without internal ids", () => {
    const lines = describeAuditChanges("DELETE", { deleted: { id: "abc", schoolId: "s", firstName: "QA", surname: "FutureDOB" } });
    expect(lines).toEqual([
      { field: "First name", before: "QA", after: "" },
      { field: "Surname", before: "FutureDOB", after: "" },
    ]);
  });

  it("returns nothing for creates", () => {
    expect(describeAuditChanges("CREATE", null)).toEqual([]);
  });
});

describe("IST audit timestamps", () => {
  it("shows a UTC instant in IST", () => {
    // 13:35 UTC is 7:05 pm IST.
    expect(formatDateTimeIST(new Date("2026-09-29T13:35:00Z"))).toMatch(/29 Sept? 2026.*7:05\s?pm/i);
  });
  it("starts an IST day at 18:30 UTC the previous evening", () => {
    expect(istDayStart("2026-09-29").toISOString()).toBe("2026-09-28T18:30:00.000Z");
  });
});
