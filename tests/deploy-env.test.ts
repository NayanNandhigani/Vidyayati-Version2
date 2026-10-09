import { describe, it, expect } from "vitest";
import { previewRibbonInfo } from "@/lib/deploy-env";

describe("preview ribbon", () => {
  it("shows on Vercel preview deployments with branch and short commit", () => {
    expect(previewRibbonInfo({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "Preview-Branch", VERCEL_GIT_COMMIT_SHA: "28e754ed1f4fd9071b9fb46ffd11e3a5170a67fb" })).toEqual({ branch: "Preview-Branch", commit: "28e754e" });
  });
  it("never shows on production, whatever branch was deployed", () => {
    expect(previewRibbonInfo({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "Preview-Branch" })).toBeNull();
    expect(previewRibbonInfo({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "Production-Branch" })).toBeNull();
  });
  it("doesn't show when running outside Vercel (local development)", () => {
    expect(previewRibbonInfo({})).toBeNull();
    expect(previewRibbonInfo({ VERCEL_ENV: "development" })).toBeNull();
  });
});
