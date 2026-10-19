-- AlterTable: Add saleId to ClientMembership to link it to the Sale that created/renewed it
ALTER TABLE "ClientMembership" ADD COLUMN "saleId" TEXT;

-- CreateIndex
CREATE INDEX "ClientMembership_saleId_idx" ON "ClientMembership"("saleId");

-- AddForeignKey
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
