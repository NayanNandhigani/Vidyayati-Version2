import { describe, expect, it } from "vitest";
import { classifyStaff, normalizeDepartment } from "@/lib/staff";
import { pipelineCounts, pipelineStage } from "@/lib/admissions";
import { classifyHomework, isActiveBucket } from "@/lib/homework";

describe("staff (BUG-16)", () => {
  it("classifies by staff type, not department", () => {
    const c = classifyStaff([
      { staffCategory: "TEACHING", employmentStatus: "ACTIVE" },
      { staffCategory: "NON_TEACHING", employmentStatus: "ON_LEAVE" },
    ]);
    expect(c).toEqual({ total: 2, teaching: 1, nonTeaching: 1, onLeave: 1 });
  });
  it("merges department spellings into one list", () => {
    expect(normalizeDepartment("Academic")).toBe("Academics");
    expect(normalizeDepartment(" academics ")).toBe("Academics");
    expect(normalizeDepartment("Admin")).toBe("Administration");
    expect(normalizeDepartment("Astronomy")).toBeNull();
  });
});

describe("admissions pipeline (BUG-20)", () => {
  const enquiries = [
    { stage: "ADMITTED", approvalStatus: "APPROVED" },
    { stage: "ADMITTED", approvalStatus: "APPROVED" },
  ];
  it("counts match the columns: two admitted are not also enquiries and applications", () => {
    expect(pipelineCounts(enquiries)).toMatchObject({ ENQUIRY: 0, APPLICATION: 0, ADMITTED: 2, REJECTED: 0, total: 2, conversionPct: 100 });
  });
  it("a rejected application is counted once, as rejected", () => {
    expect(pipelineStage({ stage: "APPLICATION", approvalStatus: "REJECTED" })).toBe("REJECTED");
  });
});

describe("homework buckets in IST (BUG-19)", () => {
  const pending = [{ status: "PENDING" as const, score: null }];
  const sep29evening = new Date("2026-09-29T13:30:00Z"); // 7 pm IST
  it("due 1 Sept is Overdue on 29 Sept", () => expect(classifyHomework(new Date("2026-09-01T00:00:00Z"), pending, sep29evening)).toBe("Overdue"));
  it("due today is Due this week, not Overdue", () => expect(classifyHomework(new Date("2026-09-29T00:00:00Z"), pending, sep29evening)).toBe("Due this week"));
  it("after midnight IST the date has moved on", () => expect(classifyHomework(new Date("2026-09-29T00:00:00Z"), pending, new Date("2026-09-29T19:00:00Z"))).toBe("Overdue"));
  it("overdue assignments are still active", () => expect(isActiveBucket("Overdue")).toBe(true));
});
