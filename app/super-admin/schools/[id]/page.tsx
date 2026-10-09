import { notFound } from "next/navigation";
import { formatIST } from "@/lib/ist";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformModuleAccess } from "@/lib/permissions";
import { hasFeature } from "@/lib/feature-flags";
import { passwordStatus } from "@/lib/initial-password-value";
import SchoolEditForm from "../SchoolEditForm";
import SchoolAddressForm from "../SchoolAddressForm";
import SchoolContactForm from "../SchoolContactForm";
import StatusForm from "../StatusForm";
import CapsForm from "../CapsForm";
import RelationshipManagerField from "../RelationshipManagerField";
import SchoolNotes from "../SchoolNotes";
import SchoolDocuments from "../SchoolDocuments";
import ModuleUsageChart from "../ModuleUsageChart";
import ModuleAccessGrid from "./ModuleAccessGrid";
import FeatureAccessGrid from "./FeatureAccessGrid";
import SchoolBillingPanel, { type SchoolInvoiceRow } from "./SchoolBillingPanel";
import AccessControlPanel from "./AccessControlPanel";
import SchoolGroupField from "./SchoolGroupField";

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ACTIVE: { bg: "var(--good-tint)", fg: "var(--good)", label: "Active" },
  TRIAL: { bg: "var(--info-tint)", fg: "var(--info)", label: "Trial" },
  EXPIRING: { bg: "var(--warn-tint)", fg: "var(--warn)", label: "Expiring soon" },
  OVERDUE: { bg: "var(--critical-tint)", fg: "var(--critical)", label: "Overdue" },
  CANCELLED: { bg: "var(--line)", fg: "var(--faint)", label: "Cancelled" },
};

// One tab per area of managing a school, each loading only its own data.
const TABS = [
  { key: "profile", label: "Profile" },
  { key: "access", label: "Access management" },
  { key: "billing", label: "Billing & payments" },
  { key: "usage", label: "Usage" },
  { key: "website", label: "Website management" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type SchoolWithAdmin = NonNullable<Awaited<ReturnType<typeof loadSchool>>>;

function loadSchool(id: string) {
  return db.school.findUnique({
    where: { id },
    include: { users: { where: { role: "SCHOOL_ADMIN" }, take: 1 }, contactPerson: true },
  });
}

export default async function SchoolProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const access = await requirePlatformModuleAccess("Schools", "VIEW");
  const canManage = access === "EDIT";
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "profile";

  const school = await loadSchool(id);
  if (!school) notFound();
  const style = STATUS_STYLE[school.status];

  return (
    <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 18, minHeight: "100dvh", boxSizing: "border-box" }}>
      <div>
        <Link href="/super-admin/schools" style={{ fontSize: 12.5, color: "var(--muted)", textDecoration: "none" }}>
          ← Back to Schools
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div className="disp" style={{ fontSize: 22 }}>
              {school.name}
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--faint)" }}>
              {school.code}
            </span>
            <span className="pill" style={{ background: style.bg, color: style.fg }}>
              {style.label}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {school.city}
            {school.state ? `, ${school.state}` : ""}
          </div>
        </div>
        <Link href={`/super-admin/contracts?new=1&school=${school.id}`} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>
          New contract →
        </Link>
      </div>

      <nav className="school-tabs" aria-label="School sections">
        {TABS.map((t) => (
          <Link key={t.key} href={`/super-admin/schools/${school.id}?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={tab === t.key ? "is-active" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "profile" && <ProfileTab school={school} canManage={canManage} />}
      {tab === "access" && <AccessTab school={school} />}
      {tab === "billing" && <BillingTab school={school} />}
      {tab === "usage" && <UsageTab schoolId={school.id} />}
      {tab === "website" && <WebsiteTab school={school} />}
    </div>
  );
}

async function ProfileTab({ school, canManage }: { school: SchoolWithAdmin; canManage: boolean }) {
  const admin = school.users[0];
  const [notesRaw, documentsRaw] = await Promise.all([
    db.schoolNote.findMany({ where: { schoolId: school.id }, orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { name: true } } } }),
    db.schoolDocument.findMany({ where: { schoolId: school.id }, orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } }),
  ]);
  const notes = notesRaw.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), authorName: n.author.name }));
  const documents = documentsRaw.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt.toISOString(),
    uploadedByName: d.uploadedBy?.name ?? null,
  }));

  return (
    <div className="m-1col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
      <div className="card" style={{ padding: 22 }}>
        <SectionTitle>School details</SectionTitle>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <DetailRow label="Admin" value={admin?.name ?? "—"} />
          <DetailRow label="Onboarded" value={formatIST(school.onboardedOn, { day: "2-digit", month: "short", year: "numeric" })} mono last />
        </div>
        <SchoolEditForm school={{ id: school.id, name: school.name, code: school.code, city: school.city, state: school.state }} />

        <SubSectionTitle>Relationship manager</SubSectionTitle>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <RelationshipManagerField schoolId={school.id} relationshipManager={school.relationshipManager} />
        </div>

        <SubSectionTitle>Registered address</SubSectionTitle>
        <SchoolAddressForm school={school} canManage={canManage} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="card" style={{ padding: 22 }}>
          <SectionTitle>Contact details</SectionTitle>
          <SchoolContactForm schoolId={school.id} schoolAddress={school} contact={school.contactPerson} canManage={canManage} />
        </div>
        <div className="card" style={{ padding: 22 }}>
          <SectionTitle>Documents</SectionTitle>
          <SchoolDocuments schoolId={school.id} documents={documents} canManage={canManage} />
          <SubSectionTitle>Notes</SubSectionTitle>
          <SchoolNotes schoolId={school.id} notes={notes} />
        </div>
      </div>
    </div>
  );
}

async function AccessTab({ school }: { school: SchoolWithAdmin }) {
  const admin = school.users[0];
  const [featureFlagsRaw, showSchoolGroups, schoolGroups, studentCount, staffCount] = await Promise.all([
    db.schoolFeatureFlag.findMany({ where: { schoolId: school.id, enabled: true }, select: { key: true } }),
    hasFeature(school.id, "admin.schoolGroups"),
    db.schoolGroup.findMany({ orderBy: { name: "asc" } }),
    db.student.count({ where: { schoolId: school.id, status: "ACTIVE" } }),
    db.staffProfile.count({ where: { schoolId: school.id } }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 22 }}>
        <SectionTitle>School Admin login</SectionTitle>
        <AccessControlPanel
          schoolId={school.id}
          loginBlocked={school.loginBlocked}
          admin={admin ? { id: admin.id, name: admin.name, username: admin.username, passwordStatus: passwordStatus(admin) } : null}
        />
      </div>

      <div className="card" style={{ padding: 22 }}>
        <SectionTitle>Modules & features</SectionTitle>
        <SubSectionTitle first>Module access</SubSectionTitle>
        <ModuleAccessGrid schoolId={school.id} disabledModules={school.disabledModules} />
        <SubSectionTitle>Feature access (depth)</SubSectionTitle>
        <FeatureAccessGrid schoolId={school.id} enabledKeys={featureFlagsRaw.map((f) => f.key)} />
      </div>

      <div className="card" style={{ padding: 22 }}>
        <SectionTitle>Limits</SectionTitle>
        <SubSectionTitle first>Seat caps</SubSectionTitle>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <CapsForm school={{ id: school.id, maxStudents: school.maxStudents, maxStaff: school.maxStaff, studentCount, staffCount }} />
        </div>
        {showSchoolGroups && (
          <>
            <SubSectionTitle>Branch group</SubSectionTitle>
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
              <SchoolGroupField schoolId={school.id} groupId={school.groupId} groups={schoolGroups} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

async function BillingTab({ school }: { school: SchoolWithAdmin }) {
  const invoicesRaw = await db.subscriptionInvoice.findMany({ where: { schoolId: school.id }, orderBy: { createdAt: "desc" }, include: { payments: true, plan: true } });
  const invoices: SchoolInvoiceRow[] = invoicesRaw.map((inv) => {
    const paidAmount = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const lastPayment = inv.payments.reduce<Date | null>((latest, p) => (!latest || p.paidOn > latest ? p.paidOn : latest), null);
    return {
      id: inv.id,
      schoolName: school.name,
      plan: inv.plan?.name ?? null,
      billingPeriod: inv.billingPeriod,
      amount: Number(inv.amount),
      paidAmount,
      status: inv.status,
      dueDate: inv.dueDate.toISOString(),
      lastPaymentDate: lastPayment ? lastPayment.toISOString() : null,
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 22 }}>
        <SectionTitle>Subscription status</SectionTitle>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <StatusForm school={{ id: school.id, status: school.status }} />
        </div>
      </div>
      <div className="card" style={{ padding: 22 }}>
        <SectionTitle>Invoices & payments</SectionTitle>
        <SchoolBillingPanel schoolId={school.id} invoices={invoices} />
      </div>
    </div>
  );
}

async function UsageTab({ schoolId }: { schoolId: string }) {
  const since30d = new Date(Date.now() - THIRTY_DAYS_MS);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const loginsSince = (from: Date) => db.activityLog.findMany({ where: { schoolId, type: "LOGIN", occurredAt: { gte: from } }, select: { userId: true }, distinct: ["userId"] });

  const [studentCount, staffCount, classCount, classGrades, parentCount, transportRouteCount, staffTotal, staffActivated, parentTotal, parentActivated, loginsToday, loginsWeek, loginsMonth, loginsYear, lastLoginAgg, moduleUsageRaw] =
    await Promise.all([
      db.student.count({ where: { schoolId, status: "ACTIVE" } }),
      db.staffProfile.count({ where: { schoolId } }),
      db.class.count({ where: { schoolId } }),
      db.class.findMany({ where: { schoolId }, select: { grade: true }, distinct: ["grade"] }),
      db.parent.count({ where: { schoolId } }),
      db.transportRoute.count({ where: { schoolId } }),
      db.user.count({ where: { schoolId, role: "STAFF" } }),
      db.user.count({ where: { schoolId, role: "STAFF", lastLoginAt: { not: null } } }),
      db.user.count({ where: { schoolId, role: "PARENT" } }),
      db.user.count({ where: { schoolId, role: "PARENT", lastLoginAt: { not: null } } }),
      loginsSince(startOfDay),
      loginsSince(startOfWeek),
      loginsSince(startOfMonth),
      loginsSince(startOfYear),
      db.user.aggregate({ where: { schoolId }, _max: { lastLoginAt: true } }),
      db.activityLog.groupBy({ by: ["module"], where: { schoolId, type: "PAGE_VIEW", module: { not: null }, occurredAt: { gte: since30d } }, _count: true }),
    ]);
  const moduleUsage = moduleUsageRaw
    .map((g) => ({ module: g.module as string, count: g._count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const lastLogin = lastLoginAgg._max.lastLoginAt;

  return (
    <div className="card" style={{ padding: 22 }}>
      <SectionTitle>Usage details</SectionTitle>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 14, marginTop: -8 }}>Read-only — reflects current activity, not editable here.</div>

      <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 18 }}>
        <Stat label="Students" value={studentCount} />
        <Stat label="Staff" value={staffCount} />
        <Stat label="Classes" value={classGrades.length} />
        <Stat label="Sections" value={classCount} />
        <Stat label="Transport vehicles" value={transportRouteCount} />
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Logins — distinct users</div>
      <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <Stat label="Today" value={loginsToday.length} small />
        <Stat label="This week" value={loginsWeek.length} small />
        <Stat label="This month" value={loginsMonth.length} small />
        <Stat label="This year" value={loginsYear.length} small />
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>Last login: {lastLogin ? formatIST(lastLogin, { day: "2-digit", month: "short", year: "numeric" }) : "Never"}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <ActivationRow label="Staff accounts" activated={staffActivated} total={staffTotal} />
        <ActivationRow label="Parent accounts" activated={parentActivated} total={parentTotal} />
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Parent accounts on record: {parentCount}</div>

      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>Module usage — last 30 days</div>
      <ModuleUsageChart data={moduleUsage} />
    </div>
  );
}

function WebsiteTab({ school }: { school: SchoolWithAdmin }) {
  return (
    <div className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
      <SectionTitle>Website management</SectionTitle>
      <span className="pill" style={{ background: "var(--info-tint)", color: "var(--info)" }}>
        Coming soon
      </span>
      <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 560, lineHeight: 1.5 }}>
        Managing {school.name}&apos;s public website from here — domain, publishing and page content — is planned for a later release. For now the school edits its own site from its portal (Settings → Website Builder).
      </div>
      <div style={{ fontSize: 12.5 }}>
        Current site address: <span className="mono">/site/{school.code}</span>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, paddingBottom: last ? 0 : 6, borderBottom: last ? undefined : "1px solid var(--line)" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className={mono ? "mono" : undefined} style={{ color: "var(--ink)", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function ActivationRow({ label, activated, total }: { label: string; activated: number; total: number }) {
  const pct = total > 0 ? Math.round((activated / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span className="mono" style={{ color: "var(--ink)" }}>
          {activated} / {total} activated
        </span>
      </div>
      <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--teal)", borderRadius: 4 }} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{children}</div>;
}

function SubSectionTitle({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: first ? "0 0 10px" : "18px 0 10px" }}>{children}</div>;
}

function Stat({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="card" style={{ padding: small ? "12px 14px" : "14px 16px" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: small ? 18 : 22, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
