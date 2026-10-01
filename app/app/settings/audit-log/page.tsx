import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getScopedDb, AUDITED_MODEL_LABEL } from "@/lib/tenant-db";
import { resolveAuditLabels, formatAuditChanges } from "@/lib/audit-labels";
import { formatDateTimeIST, istDayStart } from "@/lib/ist";
import AuditLogTable, { type AuditLogRow } from "@/components/AuditLogTable";

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ entityType?: string; actorUserId?: string; from?: string; to?: string }> }) {
  const session = await auth();
  if (session!.user.role !== "SCHOOL_ADMIN") redirect("/app/dashboard");

  const params = await searchParams;
  const sdb = await getScopedDb();

  const [rowsRaw, staffAndAdmins] = await Promise.all([
    sdb.mutationAuditLog.findMany({
      where: {
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
        ...(params.from || params.to
          ? {
              // The From/To dates are IST calendar days.
              occurredAt: {
                ...(params.from ? { gte: istDayStart(params.from) } : {}),
                ...(params.to ? { lt: new Date(istDayStart(params.to).getTime() + 24 * 60 * 60 * 1000) } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: 150,
      include: { actor: { select: { name: true } } },
    }),
    sdb.user.findMany({ where: { role: { in: ["SCHOOL_ADMIN", "STAFF"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // CREATE/UPDATE rows get a real label+link via one batched query per
  // entity type (see lib/audit-labels.ts); DELETE rows resolve from their
  // own stored snapshot instead, since there's no live record left to
  // query — both replace what used to be just the raw entityId.
  const nonDeleted = rowsRaw.filter((r) => r.action !== "DELETE");
  const [labels, changeLines] = await Promise.all([resolveAuditLabels(sdb, nonDeleted), formatAuditChanges(sdb, rowsRaw)]);

  const rows: AuditLogRow[] = rowsRaw.map((r) => {
    const resolved = labels.get(`${r.entityType}:${r.entityId}`);
    return {
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityLabel: AUDITED_MODEL_LABEL[r.entityType] ?? null,
      entityId: r.entityId,
      changes: r.changes,
      occurredAt: r.occurredAt.toISOString(),
      when: formatDateTimeIST(r.occurredAt),
      actorName: r.actor?.name ?? null,
      resolvedLabel: resolved?.label ?? null,
      href: resolved?.href ?? null,
      changeLines: changeLines.get(r.id) ?? [],
    };
  });

  return (
    <div style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 18, height: "100dvh", boxSizing: "border-box" }}>
      <div>
        <div className="disp" style={{ fontSize: 21 }}>
          Audit log
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Who changed what, across marks, students, fees, and other sensitive records</div>
      </div>

      <form method="GET" className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field">
          Entity type
          <select className="in" name="entityType" defaultValue={params.entityType ?? ""}>
            <option value="">All</option>
            {Array.from(Object.entries(AUDITED_MODEL_LABEL)).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Actor
          <select className="in" name="actorUserId" defaultValue={params.actorUserId ?? ""}>
            <option value="">All</option>
            {staffAndAdmins.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input className="in mono" type="date" name="from" defaultValue={params.from ?? ""} />
        </label>
        <label className="field">
          To
          <input className="in mono" type="date" name="to" defaultValue={params.to ?? ""} />
        </label>
        <button type="submit" style={{ background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Filter
        </button>
      </form>

      <div className="card" style={{ padding: 22, flex: 1, minHeight: 0, overflowY: "auto" }}>
        <AuditLogTable rows={rows} />
      </div>
    </div>
  );
}
