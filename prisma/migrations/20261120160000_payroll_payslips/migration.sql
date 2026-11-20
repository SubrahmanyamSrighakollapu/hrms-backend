CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "payroll_period" DATE NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payslips_employee_id_payroll_period_key"
    ON "payslips"("employee_id", "payroll_period");
CREATE INDEX "payslips_payroll_period_idx" ON "payslips"("payroll_period");

ALTER TABLE "payslips"
    ADD CONSTRAINT "payslips_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payslips"
    ADD CONSTRAINT "payslips_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
