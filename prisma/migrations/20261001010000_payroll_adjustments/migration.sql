-- QA BUG-09: payroll runs once per employee per month (payroll_runs
-- already has UNIQUE (staff_id, month)); corrections are recorded as
-- adjustments with their own Accounts entry. Additive only.
CREATE TYPE "PayrollAdjustmentKind" AS ENUM ('ADDITION', 'DEDUCTION');

CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "kind" "PayrollAdjustmentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_adjustments_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX "payroll_adjustments_school_id_idx" ON "payroll_adjustments"("school_id");
CREATE INDEX "payroll_adjustments_payroll_run_id_idx" ON "payroll_adjustments"("payroll_run_id");
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts_transactions" ADD COLUMN "payroll_adjustment_id" TEXT;
CREATE UNIQUE INDEX "accounts_transactions_payroll_adjustment_id_key" ON "accounts_transactions"("payroll_adjustment_id");
ALTER TABLE "accounts_transactions" ADD CONSTRAINT "accounts_transactions_payroll_adjustment_id_fkey" FOREIGN KEY ("payroll_adjustment_id") REFERENCES "payroll_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
