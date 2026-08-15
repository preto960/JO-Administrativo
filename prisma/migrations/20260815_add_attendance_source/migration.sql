-- AlterTable: Add source to Attendance
ALTER TABLE "Attendance" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'gym';
CREATE INDEX "Attendance_source_idx" ON "Attendance"("source");

-- Drop old unique constraint and create new one including source
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_clientId_date_key";
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_clientId_date_source_key" UNIQUE ("clientId", "date", "source");
