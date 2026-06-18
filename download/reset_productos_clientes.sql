-- ============================================================
-- 1. REINICIAR PRODUCTOS + tablas dependientes + 1 producto test
-- ============================================================
BEGIN;

-- Tablas que referencian Product (borrar antes por FK RESTRICT)
DELETE FROM "SaleLine";
DELETE FROM "PurchaseLine";
DELETE FROM "RecipeComponent";
DELETE FROM "Inventory";
DELETE FROM "InventoryAdjustment";

-- Limpiar productos
DELETE FROM "Product";

-- Insertar 1 producto test
INSERT INTO "Product" ("id","name","sku","type","costAvg","price","currencyId","categoryId","imageUrl","active","createdAt","updatedAt")
VALUES (
  'prod_test_001',
  'Producto Test',
  'TEST-001',
  'simple',
  10,
  25,
  (SELECT "id" FROM "Currency" WHERE "isBase" = true LIMIT 1),
  NULL,
  '',
  true,
  NOW(),
  NOW()
);

COMMIT;


-- ============================================================
-- 2. REINICIAR CLIENTES + todas las tablas que referencian Client
-- ============================================================
BEGIN;

-- Tablas gym que referencian Client
DELETE FROM "Attendance";           -- gym: asistencias
DELETE FROM "ClientMembership";     -- gym: membresías

-- Tablas generales que referencian Client (borrar antes por FK RESTRICT)
DELETE FROM "AccountReceivable";    -- RESTRICT → borrar primero

-- Tablas con ON DELETE SET NULL (se limpian solas al borrar Client, pero por seguridad)
DELETE FROM "Notification" WHERE "clientId" IS NOT NULL;

-- Ventas que tienen clientId (la FK es SET NULL, pero limpiamos)
UPDATE "Sale" SET "clientId" = NULL WHERE "clientId" IS NOT NULL;

-- Limpiar clientes
DELETE FROM "Client";

-- Insertar 1 cliente test
INSERT INTO "Client" ("id","cedula","name","lastName","phone","email","address","createdAt","updatedAt")
VALUES (
  'client_test_001',
  '00000000',
  'Cliente',
  'Test',
  '04120000000',
  'test@test.com',
  'Dirección test',
  NOW(),
  NOW()
);

COMMIT;