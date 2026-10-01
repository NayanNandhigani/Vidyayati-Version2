import { auth } from "@/auth";
import { getScopedDb } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { formatINR, formatINRCompact, formatDate } from "@/lib/format";
import { todayIST } from "@/lib/ist";
import { hasFeature } from "@/lib/feature-flags";
import AddTransactionPanel from "./AddTransactionPanel";
import AccountsDepthPanel from "./AccountsDepthPanel";
import TransactionRow from "./TransactionRow";

export default async function AccountsPage() {
  const accessLevel = await requireModuleAccess("Accounts", "VIEW");
  const canEdit = accessLevel === "EDIT";
  const session = await auth();
  const sdb = await getScopedDb();

  const [showChartOfAccounts, showApprovals] = await Promise.all([
    hasFeature(session!.user.schoolId, "accounts.chartOfAccounts"),
    hasFeature(session!.user.schoolId, "accounts.approvals"),
  ]);

  // Pending-approval rows are held out of every total/balance/report below
  // — they only count once approved. For schools without the feature this
  // filters nothing, since approvalStatus never leaves "NONE".
  const transactions = await sdb.accountsTransaction.findMany({ where: { approvalStatus: { not: "PENDING" } }, orderBy: { date: "asc" } });
  const pendingTransactions = showApprovals ? await sdb.accountsTransaction.findMany({ where: { approvalStatus: "PENDING" }, orderBy: { date: "desc" } }) : [];
  const accountHeads = showChartOfAccounts ? await sdb.schoolAccountHead.findMany({ orderBy: { name: "asc" } }) : [];
  const school = showApprovals ? await sdb.school.findUnique({ where: { id: session!.user.schoolId! }, select: { accountsApprovalThreshold: true } }) : null;

  let running = 0;
  const withBalance = transactions.map((t) => {
    running += t.type === "INCOME" ? Number(t.amount) : -Number(t.amount);
    return { ...t, balance: running };
  });
  const balance = running;
  const ledger = [...withBalance].reverse().slice(0, 40);

  // Month boundaries in IST; ledger dates are calendar dates (UTC midnight).
  const todayStr = todayIST();
  const [curY, curM] = todayStr.split("-").map(Number) as [number, number];
  const monthStart = new Date(Date.UTC(curY, curM - 1, 1));
  const incomeMonth = transactions.filter((t) => t.type === "INCOME" && t.date >= monthStart).reduce((s, t) => s + Number(t.amount), 0);
  const expenseMonth = transactions.filter((t) => t.type === "EXPENSE" && t.date >= monthStart).reduce((s, t) => s + Number(t.amount), 0);
  const net = incomeMonth - expenseMonth;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(curY, curM - 1 - 5 + i, 1));
    return { label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const monthlyFlow = months.map(({ label, year, month }) => {
    const inMonth = transactions.filter((t) => t.date.getUTCFullYear() === year && t.date.getUTCMonth() === month);
    return {
      label,
      income: inMonth.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0),
      expense: inMonth.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0),
    };
  });
  // A "nice" axis maximum (1, 2 or 5 × a power of ten) so the y-axis
  // labels are round numbers.
  const rawMax = Math.max(1, ...monthlyFlow.flatMap((m) => [m.income, m.expense]));
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const maxFlow = ([1, 2, 5, 10].map((f) => f * magnitude).find((v) => v >= rawMax) ?? rawMax);
  const yTicks = [maxFlow, (maxFlow * 3) / 4, maxFlow / 2, maxFlow / 4, 0];

  return (
    <div className="app-page acc-page" style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 16, height: "100dvh", boxSizing: "border-box" }}>
      <div>
        <div className="disp" style={{ fontSize: 21 }}>
          Accounts
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Simple cash flow — income and expenses in one place, no double-entry bookkeeping · {formatDate(new Date())}</div>
      </div>

      <div className="acc-stats">
        <Stat label="Income this month" value={formatINR(incomeMonth)} color="var(--teal)" />
        <Stat label="Expense this month" value={formatINR(expenseMonth)} color="var(--clay)" />
        <Stat label="Net this month" value={`${net >= 0 ? "+" : ""}${formatINR(net)}`} color={net >= 0 ? "var(--good)" : "var(--clay)"} />
        <Stat label="Cash balance" value={formatINR(balance)} />
      </div>

      <div className="acc-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
          <div className="card" style={{ padding: 20, flex: "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Income vs. expense</div>
              <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--muted)" }}>
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--teal)", marginRight: 5 }} />
                  Income
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--clay)", marginRight: 5 }} />
                  Expense
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Last 6 months, in ₹</div>
            <div style={{ display: "flex", gap: 8 }}>
              {/* y-axis */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 170, fontSize: 10, color: "var(--faint)", textAlign: "right", minWidth: 44 }} aria-hidden>
                {yTicks.map((v) => (
                  <span key={v} className="mono" style={{ lineHeight: 1 }}>
                    {formatINRCompact(v)}
                  </span>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: "clamp(8px, 3vw, 26px)", height: 170, borderBottom: "1px solid var(--line)", borderLeft: "1px solid var(--line)", paddingBottom: 2 }}>
                  {yTicks.slice(0, -1).map((v) => (
                    <div key={v} style={{ position: "absolute", left: 0, right: 0, bottom: `${(v / maxFlow) * 100}%`, borderTop: "1px dashed var(--line)", pointerEvents: "none" }} />
                  ))}
                  {monthlyFlow.map((m) => (
                    <div key={m.label} style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 4, height: "100%", position: "relative" }}>
                      <div title={`Income ${formatINR(m.income)}`} style={{ flex: 1, height: `${Math.max(1, (m.income / maxFlow) * 100)}%`, background: "var(--teal)", borderRadius: "3px 3px 0 0" }} />
                      <div title={`Expense ${formatINR(m.expense)}`} style={{ flex: 1, height: `${Math.max(1, (m.expense / maxFlow) * 100)}%`, background: "var(--clay)", borderRadius: "3px 3px 0 0" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", marginTop: 8, fontSize: 10.5, color: "var(--faint)" }}>
                  {monthlyFlow.map((m) => (
                    <span key={m.label} style={{ flex: 1, textAlign: "center" }}>
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 10px" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Transaction ledger</div>
              <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Auto-synced rows are locked — edit them from Fees or Payroll</div>
            </div>
            <div className="acc-ledger-scroll" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div className="acc-ledger-row" style={{ borderTop: "1px solid var(--line)", fontSize: 10.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "10px 20px" }}>
              <div>Date</div>
              <div>Description</div>
              <div>Category</div>
              <div>Source</div>
              <div style={{ textAlign: "right" }}>Amount</div>
              <div style={{ textAlign: "right" }}>Balance</div>
            </div>
            <div style={{ overflowY: "auto" }}>
              {ledger.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No transactions recorded yet.</div>}
              {ledger.map((t) => (
                <TransactionRow
                  key={t.id}
                  canEdit={canEdit}
                  t={{ id: t.id, date: t.date.toISOString(), description: t.description, category: t.category, source: t.source, type: t.type, amount: Number(t.amount), balance: t.balance }}
                />
              ))}
            </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, overflowY: "auto", minWidth: 0 }}>
          {canEdit && <AddTransactionPanel />}
          {canEdit && (showChartOfAccounts || showApprovals) && (
            <AccountsDepthPanel
              showChartOfAccounts={showChartOfAccounts}
              showApprovals={showApprovals}
              accountHeads={accountHeads.map((h) => ({ id: h.id, name: h.name, type: h.type }))}
              pendingTransactions={pendingTransactions.map((t) => ({ id: t.id, date: t.date.toISOString(), description: t.description, amount: Number(t.amount), type: t.type }))}
              approvalThreshold={school?.accountsApprovalThreshold ? Number(school.accountsApprovalThreshold) : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="card" style={{ padding: "15px 17px" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 7 }}>{label}</div>
      <div className="mono" style={{ fontSize: 23, fontWeight: 600, color: color ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}
