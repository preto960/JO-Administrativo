-- AlterTable: Add ticketDurationMonths to Plan
ALTER TABLE "Plan" ADD COLUMN "ticketDurationMonths" INTEGER NOT NULL DEFAULT 2;
