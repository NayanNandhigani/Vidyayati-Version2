// QA fix 1.2 one-off cleanup: before this fix, a same-month payroll
// re-run always INSERTed a second AccountsTransaction instead of updating
// the one already posted for that PayrollRun, so a staffer paid twice in
// one month (e.g. the QA test tenant's "QA Maths Teacher", September
// 2026) ended up with two ledger rows for one payslip. The
// 20260924010000_payroll_accounts_link migration links the most recent
// matching row to its PayrollRun automatically; this script finds and
// removes the leftover, now-orphaned duplicate(s) it left behind.
//
// Dry run by default — prints what it would delete. Pass --apply to
// actually delete. Safe to re-run: once there are no orphaned duplicates
// left, it does nothing.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const orphans = await db.accountsTransaction.findMany({
    where: { source: "AUTO_PAYROLL", payrollRunId: null },
    orderBy: { id: "asc" },
  });

  if (orphans.length === 0) {
    console.log("No orphaned payroll duplicates found. Nothing to do.");
    return;
  }

  console.log(`Found ${orphans.length} AUTO_PAYROLL Accounts row(s) with no linked payroll run (i.e. superseded by a later re-run of the same month):`);
  for (const row of orphans) {
    console.log(`  ${row.id}  ${row.date.toISOString().slice(0, 10)}  ${row.description}  ₹${row.amount}`);
  }

  if (!apply) {
    console.log("\nDry run only — re-run with --apply to delete these rows.");
    return;
  }

  const result = await db.accountsTransaction.deleteMany({ where: { id: { in: orphans.map((r) => r.id) } } });
  console.log(`\nDeleted ${result.count} duplicate row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
