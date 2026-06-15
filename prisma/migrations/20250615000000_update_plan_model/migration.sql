-- DropIndex
DROP INDEX IF EXISTS "Plan_name_key";

-- AlterTable: drop old duration, add new columns
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "duration";
ALTER TABLE "Plan" ADD COLUMN "durationType" TEXT NOT NULL DEFAULT '1_mes';
ALTER TABLE "Plan" ADD COLUMN "durationDays" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_name_key" ON "Plan"("name");
