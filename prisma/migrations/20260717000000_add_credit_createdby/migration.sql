-- AlterTable: Add createdById column to AccountReceivable
ALTER TABLE "AccountReceivable" ADD COLUMN "createdById" TEXT;

-- Backfill: denormalize Sale.userId into AccountReceivable.createdById for existing credits
UPDATE "AccountReceivable" ar
SET "createdById" = s."userId"
FROM "Sale" s
WHERE s."id" = ar."saleId" AND ar."createdById" IS NULL;

-- AddForeignKey: AccountReceivable.createdById -> User.id
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
