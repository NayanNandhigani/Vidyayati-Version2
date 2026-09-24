-- QA fix 1.2: a same-month payroll re-run upserted the PayrollRun but
-- always INSERTed a new AccountsTransaction, so the payslip and the
-- ledger disagreed after a second run. AccountsTransaction now links to
-- the PayrollRun it was posted from (unique, so a re-run's Accounts
-- write is an upsert keyed by this column instead of a second INSERT).

ALTER TABLE "accounts_transactions" ADD COLUMN "payroll_run_id" TEXT;

-- Backfill: best-effort link of each existing AUTO_PAYROLL transaction to
-- the PayrollRun it was almost certainly posted from (same school, same
-- "Staff salary — <name> (<month>)" description runPayroll/
-- runStructuredPayroll have always used). Where more than one transaction
-- matches the same run — the exact duplicate this fix prevents going
-- forward — only the most recent (highest id) is linked; the rest are
-- left as unlinked manual-looking rows rather than deleted, so no
-- existing ledger data is lost. A school admin can review and remove any
-- leftover duplicate from the Accounts screen once this is live.
WITH ranked AS (
  SELECT
    at."id" AS txn_id,
    pr."id" AS run_id,
    ROW_NUMBER() OVER (PARTITION BY pr."id" ORDER BY at."id" DESC) AS rn
  FROM "accounts_transactions" at
  JOIN "payroll_runs" pr ON pr."school_id" = at."school_id"
  JOIN "staff_profiles" sp ON sp."id" = pr."staff_id"
  JOIN "users" u ON u."id" = sp."user_id"
  WHERE at."source" = 'AUTO_PAYROLL'
    AND at."description" = 'Staff salary — ' || u."name" || ' (' || pr."month" || ')'
)
UPDATE "accounts_transactions" at
SET "payroll_run_id" = ranked.run_id
FROM ranked
WHERE ranked.txn_id = at."id" AND ranked.rn = 1;

CREATE UNIQUE INDEX "accounts_transactions_payroll_run_id_key" ON "accounts_transactions"("payroll_run_id");
ALTER TABLE "accounts_transactions" ADD CONSTRAINT "accounts_transactions_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
