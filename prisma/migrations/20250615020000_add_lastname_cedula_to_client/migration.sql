-- Add lastName column to Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "lastName" TEXT;

-- Add cedula column to Client (with unique constraint)
DO $$ BEGIN
    ALTER TABLE "Client" ADD COLUMN "cedula" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_cedula_key" ON "Client"("cedula");

-- Add lastAttendance column to Client (for gym attendance tracking)
DO $$ BEGIN
    ALTER TABLE "Client" ADD COLUMN "lastAttendance" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;