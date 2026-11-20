-- CreateEnum
CREATE TYPE "TimeOffRequestType" AS ENUM ('LEAVE', 'PERMISSION', 'REGULARIZATION', 'EXTRA_HOURS');

-- CreateEnum
CREATE TYPE "TimeOffRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'EARNED', 'COMP_OFF', 'PERSONAL', 'UNPAID');

-- CreateTable
CREATE TABLE "time_off_requests" (
    "id" TEXT NOT NULL,
    "type" "TimeOffRequestType" NOT NULL,
    "status" "TimeOffRequestStatus" NOT NULL DEFAULT 'PENDING',
    "employee_id" TEXT NOT NULL,
    "leave_type" "LeaveType",
    "from_date" TIMESTAMP(3),
    "to_date" TIMESTAMP(3),
    "days" DECIMAL(5,2),
    "permission_date" TIMESTAMP(3),
    "from_time" TEXT,
    "to_time" TEXT,
    "regularization_date" TIMESTAMP(3),
    "actual_in_time" TEXT,
    "actual_out_time" TEXT,
    "extra_hours_date" TIMESTAMP(3),
    "extra_hours_from" TEXT,
    "extra_hours_to" TEXT,
    "extra_hours" DECIMAL(5,2),
    "reason" TEXT NOT NULL,
    "approver_id" TEXT,
    "approver_role_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approval_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "year" INTEGER NOT NULL,
    "total" DECIMAL(6,2) NOT NULL,
    "used" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_flows" (
    "id" TEXT NOT NULL,
    "request_type" "TimeOffRequestType" NOT NULL,
    "approver_role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_off_requests_employee_id_idx" ON "time_off_requests"("employee_id");

-- CreateIndex
CREATE INDEX "time_off_requests_status_idx" ON "time_off_requests"("status");

-- CreateIndex
CREATE INDEX "time_off_requests_type_idx" ON "time_off_requests"("type");

-- CreateIndex
CREATE INDEX "leave_balances_employee_id_idx" ON "leave_balances"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_year_key" ON "leave_balances"("employee_id", "leave_type", "year");

-- CreateIndex
CREATE UNIQUE INDEX "approval_flows_request_type_key" ON "approval_flows"("request_type");

-- CreateIndex
CREATE INDEX "approval_flows_approver_role_id_idx" ON "approval_flows"("approver_role_id");

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flows" ADD CONSTRAINT "approval_flows_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
