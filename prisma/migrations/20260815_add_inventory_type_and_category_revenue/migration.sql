-- AlterTable: Add inventoryType and cashRegId to InventoryCheck
ALTER TABLE "InventoryCheck" ADD COLUMN "inventoryType" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "InventoryCheck" ADD COLUMN "cashRegId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryCheck_inventoryType_idx" ON "InventoryCheck"("inventoryType");
