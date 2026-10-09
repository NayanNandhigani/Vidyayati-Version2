// Which kind of deployment this is, from the variables Vercel sets on every
// build and request. Used for the "Preview site" ribbon: it shows on Vercel
// preview deployments (Preview-Branch and any other non-production branch)
// and never on production — VERCEL_ENV is "production" there whatever code
// is deployed, so merging this into Production-Branch can't make the live
// site look like a preview.

export type PreviewRibbonInfo = { branch: string | null; commit: string | null };

export function previewRibbonInfo(env: Record<string, string | undefined> = process.env): PreviewRibbonInfo | null {
  if (env.VERCEL_ENV !== "preview") return null;
  return {
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    commit: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
  };
}
