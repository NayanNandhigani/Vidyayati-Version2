import { describe, expect, it } from "vitest";
import { classAveragePercent, competitionRanks, evaluateStudent, formatMark, passMarkFor, resultLabel, subjectAveragePercent } from "@/lib/exam-rules";
import { CBSE_9_POINT, SIMPLE_A_TO_E, gradeForBands } from "@/lib/grade-scales";

const eng = { id: "eng", maxMarks: 100, passMarks: 33 };
const math = { id: "math", maxMarks: 100, passMarks: null };
const subjects = [eng, math];

describe("evaluateStudent", () => {
  it("no marks at all is NOT_STARTED, not 0/200", () => expect(evaluateStudent(subjects, {}).status).toBe("NOT_STARTED"));
  it("some subjects missing is INCOMPLETE and has no total", () => {
    const r = evaluateStudent(subjects, { eng: { obtained: 80, absent: false } });
    expect(r.status).toBe("INCOMPLETE");
    expect(r).not.toHaveProperty("total");
  });
  it("complete result totals every subject", () => {
    const r = evaluateStudent(subjects, { eng: { obtained: 80, absent: false }, math: { obtained: 70, absent: false } });
    expect(r).toMatchObject({ status: "COMPLETE", total: 150, max: 200, percentage: 75, passed: true });
  });
  it("BUG-14: 0 in English (pass mark 33) fails overall", () => {
    const r = evaluateStudent(subjects, { eng: { obtained: 0, absent: false }, math: { obtained: 99, absent: false } });
    expect(r.status === "COMPLETE" && r.passed).toBe(false);
    expect(r.status === "COMPLETE" && r.failedSubjectIds).toEqual(["eng"]);
  });
  it("absent counts as 0 and fails the subject", () => {
    const r = evaluateStudent(subjects, { eng: { obtained: null, absent: true }, math: { obtained: 90, absent: false } });
    expect(r).toMatchObject({ status: "COMPLETE", total: 90, max: 200, passed: false, absentSubjectIds: ["eng"] });
  });
  it("default pass mark is 33% when the exam doesn't set one", () => {
    expect(passMarkFor(math)).toBe(33);
    expect(passMarkFor({ id: "x", maxMarks: 50, passMarks: null })).toBe(17);
  });
});

describe("ranking and averages", () => {
  it("equal totals share a rank: 1, 2, 2, 4", () => {
    const r = competitionRanks([
      { id: "a", total: 190 },
      { id: "b", total: 170 },
      { id: "c", total: 170 },
      { id: "d", total: 150 },
    ]);
    expect([...r.entries()].sort()).toEqual([["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
  });
  it("subject average ignores absent and not-entered marks", () => {
    expect(subjectAveragePercent(100, [{ obtained: 80, absent: false }, { obtained: null, absent: true }, undefined, { obtained: 60, absent: false }])).toBe(70);
    expect(subjectAveragePercent(100, [undefined])).toBeNull();
  });
  it("class average is the mean of complete results", () => {
    expect(classAveragePercent([75, 85])).toBe(80);
    expect(classAveragePercent([])).toBeNull();
  });
  it("labels and mark display", () => {
    expect(resultLabel(true)).toBe("Pass");
    expect(resultLabel(false)).toBe("Needs improvement");
    expect(resultLabel(false, "Fail")).toBe("Fail");
    expect(formatMark(undefined)).toBe("—");
    expect(formatMark({ obtained: null, absent: true })).toBe("AB");
  });
});

describe("grade scales (BUG-15)", () => {
  it("CBSE 9-point", () => {
    expect(gradeForBands(95, CBSE_9_POINT.bands)).toBe("A1");
    expect(gradeForBands(90.5, CBSE_9_POINT.bands)).toBe("A2"); // between published bands
    expect(gradeForBands(81, CBSE_9_POINT.bands)).toBe("A2");
    expect(gradeForBands(35, CBSE_9_POINT.bands)).toBe("D");
    expect(gradeForBands(32.9, CBSE_9_POINT.bands)).toBe("E");
  });
  it("simple A+ to E, also the default", () => {
    expect(gradeForBands(91, SIMPLE_A_TO_E.bands)).toBe("A+");
    expect(gradeForBands(10, [])).toBe("E");
  });
});
