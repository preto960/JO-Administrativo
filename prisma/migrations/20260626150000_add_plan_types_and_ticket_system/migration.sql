-- AlterTable: Add new columns to "Plan"
ALTER TABLE "Plan" ADD COLUMN "planType" TEXT NOT NULL DEFAULT 'dias';
ALTER TABLE "Plan" ADD COLUMN "ticketCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "startTime" TEXT;
ALTER TABLE "Plan" ADD COLUMN "endTime" TEXT;

-- AlterTable: Add new columns to "ClientMembership"
ALTER TABLE "ClientMembership" ADD COLUMN "planType" TEXT NOT NULL DEFAULT 'dias';
ALTER TABLE "ClientMembership" ADD COLUMN "startTime" TEXT;
ALTER TABLE "ClientMembership" ADD COLUMN "endTime" TEXT;