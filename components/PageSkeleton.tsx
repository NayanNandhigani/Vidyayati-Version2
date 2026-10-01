// Shown instantly while a school-portal page loads (QA BUG-28), so a click
// in the sidebar or on "+ Add Student" responds at once instead of the old
// page sitting there until the new one has fully rendered on the server.
function Block({ height, style }: { height: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton-block" style={{ height, borderRadius: 10, ...style }} />;
}

export default function PageSkeleton() {
  return (
    <div className="app-page" style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 18 }} aria-busy="true" aria-label="Loading">
      <Block height={30} style={{ width: 220 }} />
      <Block height={16} style={{ width: 320, maxWidth: "80%" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} height={72} />
        ))}
      </div>
      <Block height={320} />
    </div>
  );
}
