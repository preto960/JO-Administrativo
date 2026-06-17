-- ============================================================
-- JO-Administrativo - Tablas ordenadas por dependencias FK
-- Generado: 2026-06-17
-- Orden: tablas sin FK primero, luego las que dependen de ellas
-- ============================================================

-- ============================================================
-- NIVEL 0: Sin dependencias (tablas base)
-- ============================================================

-- 1. Branch (sin FK)
DROP TABLE IF EXISTS "public"."Branch" CASCADE;
CREATE TABLE "public"."Branch" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "code" text NOT NULL,
    "address" text,
    "phone" text,
    "active" bool NOT NULL DEFAULT true,
    "isMain" bool NOT NULL DEFAULT false,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Branch_code_key" ON public."Branch" USING btree (code);

-- 2. Currency (sin FK)
DROP TABLE IF EXISTS "public"."Currency" CASCADE;
CREATE TABLE "public"."Currency" (
    "id" text NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "symbol" text NOT NULL,
    "isBase" bool NOT NULL DEFAULT false,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Currency_code_key" ON public."Currency" USING btree (code);

-- 3. Category (sin FK)
DROP TABLE IF EXISTS "public"."Category" CASCADE;
CREATE TABLE "public"."Category" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "unitType" text NOT NULL DEFAULT 'unit'::text,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- 4. Plan (sin FK)
DROP TABLE IF EXISTS "public"."Plan" CASCADE;
CREATE TABLE "public"."Plan" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "active" bool NOT NULL DEFAULT true,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    "cost" float8 NOT NULL DEFAULT 0,
    "durationDays" int4,
    "durationType" text NOT NULL DEFAULT '1_mes'::text,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_name_key" ON public."Plan" USING btree (name);

-- 5. Client (sin FK)
DROP TABLE IF EXISTS "public"."Client" CASCADE;
CREATE TABLE "public"."Client" (
    "id" text NOT NULL,
    "cedula" text,
    "name" text NOT NULL,
    "lastName" text,
    "phone" text,
    "email" text,
    "address" text,
    "birthDate" timestamp(3),
    "age" int4,
    "gender" text,
    "note" text,
    "lastAttendance" timestamp(3),
    "deletedAt" timestamp(3),
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Client_cedula_key" ON public."Client" USING btree (cedula);

-- 6. Settings (sin FK)
DROP TABLE IF EXISTS "public"."Settings" CASCADE;
CREATE TABLE "public"."Settings" (
    "id" text NOT NULL,
    "key" text NOT NULL DEFAULT 'general'::text,
    "businessName" text NOT NULL DEFAULT 'JO-Administrativo'::text,
    "logoUrl" text NOT NULL DEFAULT ''::text,
    "address" text NOT NULL DEFAULT ''::text,
    "phone" text NOT NULL DEFAULT ''::text,
    "rif" text NOT NULL DEFAULT ''::text,
    "email" text NOT NULL DEFAULT ''::text,
    "baseCurrencyId" text NOT NULL DEFAULT ''::text,
    "referenceCurrency" text NOT NULL DEFAULT 'USD'::text,
    "usdRate" float8 NOT NULL DEFAULT 0,
    "eurRate" float8 NOT NULL DEFAULT 0,
    "customRate" float8 NOT NULL DEFAULT 0,
    "exchangeRate" float8 NOT NULL DEFAULT 36.50,
    "sessionDuration" int4 NOT NULL DEFAULT 28800,
    "notificationsEnabled" bool NOT NULL DEFAULT true,
    "ivaEnabled" bool NOT NULL DEFAULT false,
    "ivaRate" float8 NOT NULL DEFAULT 16.00,
    "primaryColor" text NOT NULL DEFAULT 'blue'::text,
    "secondaryColor" text NOT NULL DEFAULT 'slate'::text,
    "theme" text NOT NULL DEFAULT 'light'::text,
    "rolePermissions" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "multiCurrencyEnabled" bool NOT NULL DEFAULT false,
    "country" text NOT NULL DEFAULT 'VE'::text,
    "tutorialTexts" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    "businessType" text NOT NULL DEFAULT ''::text,
    "clientCode" text NOT NULL DEFAULT ''::text,
    PRIMARY KEY ("id")
);

-- 7. Supplier (sin FK)
DROP TABLE IF EXISTS "public"."Supplier" CASCADE;
CREATE TABLE "public"."Supplier" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "rif" text,
    "phone" text,
    "email" text,
    "address" text,
    "balance" float8 NOT NULL DEFAULT 0,
    "deletedAt" timestamp(3),
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_rif_key" ON public."Supplier" USING btree (rif);

-- 8. PaymentMethod (sin FK)
DROP TABLE IF EXISTS "public"."PaymentMethod" CASCADE;
CREATE TABLE "public"."PaymentMethod" (
    "id" text NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "icon" text NOT NULL DEFAULT 'Banknote'::text,
    "enabled" bool NOT NULL DEFAULT true,
    "needsReference" bool NOT NULL DEFAULT false,
    "isLocalCurrency" bool NOT NULL DEFAULT false,
    "isCash" bool NOT NULL DEFAULT false,
    "isCredit" bool NOT NULL DEFAULT false,
    "sortOrder" int4 NOT NULL DEFAULT 0,
    "countries" text NOT NULL DEFAULT 'ALL'::text,
    "isDefault" bool NOT NULL DEFAULT false,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentMethod_code_key" ON public."PaymentMethod" USING btree (code);

-- ============================================================
-- NIVEL 1: Dependen solo de tablas del Nivel 0
-- ============================================================

-- 9. User (→ Branch)
DROP TABLE IF EXISTS "public"."User" CASCADE;
CREATE TABLE "public"."User" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "password" text NOT NULL DEFAULT 'changeme'::text,
    "role" text NOT NULL DEFAULT 'cajero'::text,
    "active" bool NOT NULL DEFAULT true,
    "branchId" text,
    "deletedAt" timestamp(3),
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

-- 10. ExchangeRate (→ Currency x2)
DROP TABLE IF EXISTS "public"."ExchangeRate" CASCADE;
CREATE TABLE "public"."ExchangeRate" (
    "id" text NOT NULL,
    "fromCurrencyId" text NOT NULL,
    "toCurrencyId" text NOT NULL,
    "rate" float8 NOT NULL,
    "date" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_fromCurrencyId_fkey" FOREIGN KEY ("fromCurrencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeRate_toCurrencyId_fkey" FOREIGN KEY ("toCurrencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExchangeRate_fromCurrencyId_toCurrencyId_date_key" ON public."ExchangeRate" USING btree ("fromCurrencyId", "toCurrencyId", date);

-- 11. Product (→ Currency, Category)
DROP TABLE IF EXISTS "public"."Product" CASCADE;
CREATE TABLE "public"."Product" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "sku" text,
    "type" text NOT NULL DEFAULT 'simple'::text,
    "costAvg" float8 NOT NULL DEFAULT 0,
    "price" float8 NOT NULL,
    "currencyId" text NOT NULL,
    "categoryId" text,
    "imageUrl" text NOT NULL DEFAULT ''::text,
    "active" bool NOT NULL DEFAULT true,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "Product_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Product_sku_key" ON public."Product" USING btree (sku);

-- 12. Attendance (→ Client)
DROP TABLE IF EXISTS "public"."Attendance" CASCADE;
CREATE TABLE "public"."Attendance" (
    "id" text NOT NULL,
    "clientId" text NOT NULL,
    "date" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX "Attendance_clientId_idx" ON public."Attendance" USING btree ("clientId");
CREATE INDEX "Attendance_date_idx" ON public."Attendance" USING btree (date);
CREATE UNIQUE INDEX "Attendance_clientId_date_key" ON public."Attendance" USING btree ("clientId", date);

-- 13. ClientMembership (→ Client, Plan)
DROP TABLE IF EXISTS "public"."ClientMembership" CASCADE;
CREATE TABLE "public"."ClientMembership" (
    "id" text NOT NULL,
    "clientId" text NOT NULL,
    "status" text NOT NULL DEFAULT 'Sin membresia'::text,
    "tarifa" text,
    "paymentDate" timestamp(3),
    "startDate" timestamp(3),
    "endDate" timestamp(3),
    "daysRemaining" int4 NOT NULL DEFAULT 0,
    "ticketsRemaining" int4 NOT NULL DEFAULT 0,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    "planId" text,
    CONSTRAINT "ClientMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX "ClientMembership_planId_idx" ON public."ClientMembership" USING btree ("planId");
CREATE INDEX "ClientMembership_clientId_idx" ON public."ClientMembership" USING btree ("clientId");
CREATE INDEX "ClientMembership_status_idx" ON public."ClientMembership" USING btree (status);

-- 14. SalesTarget (→ User)
DROP TABLE IF EXISTS "public"."SalesTarget" CASCADE;
CREATE TABLE "public"."SalesTarget" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "yearMonth" text NOT NULL,
    "targetAmount" float8 NOT NULL DEFAULT 0,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX "SalesTarget_yearMonth_idx" ON public."SalesTarget" USING btree ("yearMonth");
CREATE UNIQUE INDEX "SalesTarget_userId_yearMonth_key" ON public."SalesTarget" USING btree ("userId", "yearMonth");

-- 15. AuditLog (→ User)
DROP TABLE IF EXISTS "public"."AuditLog" CASCADE;
CREATE TABLE "public"."AuditLog" (
    "id" text NOT NULL,
    "userId" text NOT NULL DEFAULT 'system'::text,
    "userName" text NOT NULL DEFAULT 'Sistema'::text,
    "userRole" text NOT NULL DEFAULT 'system'::text,
    "action" text NOT NULL,
    "entity" text NOT NULL,
    "entityId" text,
    "details" jsonb,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_userId_idx" ON public."AuditLog" USING btree ("userId");
CREATE INDEX "AuditLog_entity_idx" ON public."AuditLog" USING btree (entity);
CREATE INDEX "AuditLog_action_idx" ON public."AuditLog" USING btree (action);
CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");

-- ============================================================
-- NIVEL 2: Dependen de tablas del Nivel 0 y 1
-- ============================================================

-- 16. Inventory (→ Product, Branch)
DROP TABLE IF EXISTS "public"."Inventory" CASCADE;
CREATE TABLE "public"."Inventory" (
    "id" text NOT NULL,
    "productId" text NOT NULL,
    "branchId" text NOT NULL,
    "stock" float8 NOT NULL DEFAULT 0,
    "minStock" float8 NOT NULL DEFAULT 0,
    "price" float8 NOT NULL DEFAULT 0,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Inventory_productId_branchId_key" ON public."Inventory" USING btree ("productId", "branchId");

-- 17. RecipeComponent (→ Product x2)
DROP TABLE IF EXISTS "public"."RecipeComponent" CASCADE;
CREATE TABLE "public"."RecipeComponent" (
    "id" text NOT NULL,
    "productId" text NOT NULL,
    "componentId" text NOT NULL,
    "quantity" float8 NOT NULL,
    "unit" text NOT NULL DEFAULT 'unidad'::text,
    CONSTRAINT "RecipeComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecipeComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecipeComponent_productId_componentId_key" ON public."RecipeComponent" USING btree ("productId", "componentId");

-- 18. Purchase (→ Supplier, Currency, Branch)
DROP TABLE IF EXISTS "public"."Purchase" CASCADE;
CREATE TABLE "public"."Purchase" (
    "id" text NOT NULL,
    "supplierId" text NOT NULL,
    "branchId" text NOT NULL,
    "date" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" float8 NOT NULL DEFAULT 0,
    "paidAmount" float8 NOT NULL DEFAULT 0,
    "status" text NOT NULL DEFAULT 'recibida'::text,
    "currencyId" text NOT NULL,
    "paidUpfront" bool NOT NULL DEFAULT false,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 19. CashRegister (→ User, Branch, Currency)
DROP TABLE IF EXISTS "public"."CashRegister" CASCADE;
CREATE TABLE "public"."CashRegister" (
    "id" text NOT NULL,
    "name" text,
    "userId" text NOT NULL,
    "branchId" text NOT NULL,
    "currencyId" text NOT NULL DEFAULT ''::text,
    "openingDate" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingDate" timestamp(3),
    "initialAmt" float8 NOT NULL DEFAULT 0,
    "currentAmt" float8 NOT NULL DEFAULT 0,
    "status" text NOT NULL DEFAULT 'abierta'::text,
    CONSTRAINT "CashRegister_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashRegister_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 20. Notification (→ User, Client)
DROP TABLE IF EXISTS "public"."Notification" CASCADE;
CREATE TABLE "public"."Notification" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "title" text NOT NULL,
    "message" text NOT NULL,
    "type" text NOT NULL DEFAULT 'info'::text,
    "read" bool NOT NULL DEFAULT false,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" text,
    "clientName" text,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 21. InventoryAdjustment (→ Product, User, Branch)
DROP TABLE IF EXISTS "public"."InventoryAdjustment" CASCADE;
CREATE TABLE "public"."InventoryAdjustment" (
    "id" text NOT NULL,
    "productId" text NOT NULL,
    "branchId" text NOT NULL,
    "type" text NOT NULL,
    "quantity" float8 NOT NULL,
    "reason" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 22. Expense (→ Currency, User, Branch)
DROP TABLE IF EXISTS "public"."Expense" CASCADE;
CREATE TABLE "public"."Expense" (
    "id" text NOT NULL,
    "branchId" text NOT NULL,
    "category" text NOT NULL,
    "description" text NOT NULL,
    "amount" float8 NOT NULL,
    "currencyId" text NOT NULL,
    "date" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" text NOT NULL,
    "deletedAt" timestamp(3),
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 23. AccountPayable (→ Supplier, Purchase, Currency)
DROP TABLE IF EXISTS "public"."AccountPayable" CASCADE;
CREATE TABLE "public"."AccountPayable" (
    "id" text NOT NULL,
    "supplierId" text NOT NULL,
    "purchaseId" text,
    "currencyId" text NOT NULL DEFAULT ''::text,
    "amount" float8 NOT NULL,
    "pendingBalance" float8 NOT NULL,
    "dueDate" timestamp(3),
    "status" text NOT NULL DEFAULT 'pendiente'::text,
    "description" text,
    "invoiceNumber" text,
    "invoiceUrl" text,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountPayable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "public"."Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountPayable_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- ============================================================
-- NIVEL 3: Dependen de tablas del Nivel 2
-- ============================================================

-- 24. PurchaseLine (→ Purchase, Product)
DROP TABLE IF EXISTS "public"."PurchaseLine" CASCADE;
CREATE TABLE "public"."PurchaseLine" (
    "id" text NOT NULL,
    "purchaseId" text NOT NULL,
    "productId" text NOT NULL,
    "quantity" float8 NOT NULL,
    "unitCost" float8 NOT NULL,
    "subtotal" float8 NOT NULL,
    CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "public"."Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 25. Sale (→ Client, CashRegister, Currency, User, Branch)
DROP TABLE IF EXISTS "public"."Sale" CASCADE;
CREATE TABLE "public"."Sale" (
    "id" text NOT NULL,
    "clientId" text,
    "cashRegId" text,
    "userId" text NOT NULL,
    "branchId" text NOT NULL,
    "currencyId" text NOT NULL DEFAULT ''::text,
    "date" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" float8 NOT NULL DEFAULT 0,
    "status" text NOT NULL DEFAULT 'completada'::text,
    "syncStatus" text NOT NULL DEFAULT 'synced'::text,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_cashRegId_fkey" FOREIGN KEY ("cashRegId") REFERENCES "public"."CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- ============================================================
-- NIVEL 4: Dependen de Sale / AccountPayable
-- ============================================================

-- 26. AccountReceivable (→ Client, Sale, Currency)
DROP TABLE IF EXISTS "public"."AccountReceivable" CASCADE;
CREATE TABLE "public"."AccountReceivable" (
    "id" text NOT NULL,
    "clientId" text NOT NULL,
    "saleId" text NOT NULL,
    "currencyId" text NOT NULL DEFAULT ''::text,
    "amount" float8 NOT NULL,
    "pendingBalance" float8 NOT NULL,
    "dueDate" timestamp(3),
    "status" text NOT NULL DEFAULT 'pendiente'::text,
    CONSTRAINT "AccountReceivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountReceivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountReceivable_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 27. SaleLine (→ Sale, Product)
DROP TABLE IF EXISTS "public"."SaleLine" CASCADE;
CREATE TABLE "public"."SaleLine" (
    "id" text NOT NULL,
    "saleId" text NOT NULL,
    "productId" text NOT NULL,
    "quantity" float8 NOT NULL,
    "unitPrice" float8 NOT NULL,
    "unitCost" float8 NOT NULL,
    "lineTotal" float8 NOT NULL,
    "lineProfit" float8 NOT NULL,
    CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 28. SalePayment (→ Sale, Currency)
DROP TABLE IF EXISTS "public"."SalePayment" CASCADE;
CREATE TABLE "public"."SalePayment" (
    "id" text NOT NULL,
    "saleId" text NOT NULL,
    "method" text NOT NULL,
    "amount" float8 NOT NULL,
    "currencyId" text NOT NULL,
    "reference" text,
    CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalePayment_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 29. CashMovement (→ CashRegister, Currency, User)
DROP TABLE IF EXISTS "public"."CashMovement" CASCADE;
CREATE TABLE "public"."CashMovement" (
    "id" text NOT NULL,
    "cashRegId" text NOT NULL,
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "amount" float8 NOT NULL,
    "concept" text NOT NULL,
    "currencyId" text NOT NULL,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_cashRegId_fkey" FOREIGN KEY ("cashRegId") REFERENCES "public"."CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "public"."Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 30. CashCut (→ CashRegister)
DROP TABLE IF EXISTS "public"."CashCut" CASCADE;
CREATE TABLE "public"."CashCut" (
    "id" text NOT NULL,
    "cashRegId" text NOT NULL,
    "totalSales" float8 NOT NULL DEFAULT 0,
    "totalExpenses" float8 NOT NULL DEFAULT 0,
    "totalRetiros" float8 NOT NULL DEFAULT 0,
    "expected" float8 NOT NULL DEFAULT 0,
    "actual" float8 NOT NULL DEFAULT 0,
    "difference" float8 NOT NULL DEFAULT 0,
    "cutDate" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashCut_cashRegId_fkey" FOREIGN KEY ("cashRegId") REFERENCES "public"."CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 31. CashAudit (→ CashRegister, User)
DROP TABLE IF EXISTS "public"."CashAudit" CASCADE;
CREATE TABLE "public"."CashAudit" (
    "id" text NOT NULL,
    "cashRegId" text NOT NULL,
    "userId" text NOT NULL,
    "expected" float8 NOT NULL DEFAULT 0,
    "counted" float8 NOT NULL DEFAULT 0,
    "difference" float8 NOT NULL DEFAULT 0,
    "breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "notes" text,
    "auditDate" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashAudit_cashRegId_fkey" FOREIGN KEY ("cashRegId") REFERENCES "public"."CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- 32. SupplierPayment (→ Supplier, AccountPayable, User)
DROP TABLE IF EXISTS "public"."SupplierPayment" CASCADE;
CREATE TABLE "public"."SupplierPayment" (
    "id" text NOT NULL,
    "supplierId" text NOT NULL,
    "payableId" text,
    "amount" float8 NOT NULL,
    "method" text NOT NULL DEFAULT 'efectivo'::text,
    "reference" text,
    "cashRegId" text,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "public"."AccountPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);