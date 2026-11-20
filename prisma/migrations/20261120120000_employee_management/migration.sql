-- Employee management foundation: departments, employee categories and counters.

-- CreateEnum
CREATE TYPE "EmployeeCategory" AS ENUM ('INTERN', 'FRESHER', 'EXPERIENCED', 'CONTRACT');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- AlterTable
-- "department" is dropped further down, once its values have been migrated.
ALTER TABLE "users"
ADD COLUMN     "address" TEXT,
ADD COLUMN     "category" "EmployeeCategory" NOT NULL DEFAULT 'FRESHER',
ADD COLUMN     "confirmation_date" TIMESTAMP(3),
ADD COLUMN     "contract_end_date" TIMESTAMP(3),
ADD COLUMN     "date_of_birth" TIMESTAMP(3),
ADD COLUMN     "department_id" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "prior_experience_months" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "probation_end_date" TIMESTAMP(3);

-- Preserve the existing free-text department values as real department records.
INSERT INTO "departments" ("id", "name", "updated_at")
SELECT md5(d."name"), d."name", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT TRIM("department") AS "name"
    FROM "users"
    WHERE "department" IS NOT NULL AND TRIM("department") <> ''
) AS d
ON CONFLICT ("name") DO NOTHING;

UPDATE "users" u
SET "department_id" = dep."id"
FROM "departments" dep
WHERE u."department" IS NOT NULL AND TRIM(u."department") = dep."name";

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "users_employee_code_idx" ON "users"("employee_code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropColumn (now represented by the department relation)
ALTER TABLE "users" DROP COLUMN "department";
