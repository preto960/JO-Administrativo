-- AlterTable: Add new columns to "Client"
ALTER TABLE "Client" ADD COLUMN "source" TEXT;
ALTER TABLE "Client" ADD COLUMN "agreementName" TEXT;
ALTER TABLE "Client" ADD COLUMN "promotionName" TEXT;

-- CreateTable: InventoryCheck
CREATE TABLE "InventoryCheck" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InventoryCheckItem
CREATE TABLE "InventoryCheckItem" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "initialStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verifiedStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discrepancyQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discrepancyAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "InventoryCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CostCenter
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CostEntry
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currencyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ExpenseBudget
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "budgetAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_name_key" ON "CostCenter"("name");
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");
CREATE UNIQUE INDEX "ExpenseBudget_costCenterId_yearMonth_key" ON "ExpenseBudget"("costCenterId", "yearMonth");
CREATE INDEX "InventoryCheck_branchId_idx" ON "InventoryCheck"("branchId");
CREATE INDEX "InventoryCheck_checkDate_idx" ON "InventoryCheck"("checkDate");
CREATE INDEX "InventoryCheckItem_checkId_idx" ON "InventoryCheckItem"("checkId");
CREATE INDEX "CostEntry_costCenterId_idx" ON "CostEntry"("costCenterId");
CREATE INDEX "CostEntry_date_idx" ON "CostEntry"("date");
CREATE INDEX "ExpenseBudget_yearMonth_idx" ON "ExpenseBudget"("yearMonth");

-- AddForeignKey
ALTER TABLE "InventoryCheck" ADD CONSTRAINT "InventoryCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCheck" ADD CONSTRAINT "InventoryCheck_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCheckItem" ADD CONSTRAINT "InventoryCheckItem_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "InventoryCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCheckItem" ADD CONSTRAINT "InventoryCheckItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
