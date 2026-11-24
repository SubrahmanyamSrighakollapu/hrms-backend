-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('PUBLIC', 'OPTIONAL');

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'PUBLIC',
    "description" TEXT,
    "year" INTEGER NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "location_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_settings" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "optional_holiday_allowance" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_avails" (
    "id" TEXT NOT NULL,
    "holiday_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_avails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_year_idx" ON "holidays"("year");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "holidays_location_id_idx" ON "holidays"("location_id");

-- CreateIndex
CREATE INDEX "holiday_avails_user_id_year_idx" ON "holiday_avails"("user_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_avails_holiday_id_user_id_key" ON "holiday_avails"("holiday_id", "user_id");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_avails" ADD CONSTRAINT "holiday_avails_holiday_id_fkey" FOREIGN KEY ("holiday_id") REFERENCES "holidays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_avails" ADD CONSTRAINT "holiday_avails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
