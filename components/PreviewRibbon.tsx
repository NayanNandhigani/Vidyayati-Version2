import type { PreviewRibbonInfo } from "@/lib/deploy-env";

// A strip across the top of every page on a preview deployment, so nobody
// mistakes the test site (with its own test database) for the live one.
// Rendered only when previewRibbonInfo() says this is a preview — never on
// production.
export default function PreviewRibbon({ info }: { info: PreviewRibbonInfo }) {
  return (
    <div className="preview-ribbon print-hide" role="note">
      <strong>PREVIEW SITE</strong>
      <span className="preview-ribbon-detail">
        For testing only — not the live school portal. Changes here don't affect real data.
      </span>
      {(info.branch || info.commit) && (
        <span className="preview-ribbon-meta">
          {info.branch}
          {info.branch && info.commit ? " · " : ""}
          {info.commit}
        </span>
      )}
    </div>
  );
}
