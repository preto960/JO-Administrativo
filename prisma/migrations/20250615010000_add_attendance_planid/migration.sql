-- Create Attendance table
CREATE TABLE IF NOT EXISTS "Attendance" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_clientId_date_key" ON "Attendance"("clientId", "date");
CREATE INDEX IF NOT EXISTS "Attendance_clientId_idx" ON "Attendance"("clientId");
CREATE INDEX IF NOT EXISTS "Attendance_date_idx" ON "Attendance"("date");

-- Add planId to ClientMembership
ALTER TABLE "ClientMembership" ADD COLUMN IF NOT EXISTS "planId" TEXT;

-- Add foreign key
DO $$ BEGIN
    ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add index on planId
CREATE INDEX IF NOT EXISTS "ClientMembership_planId_idx" ON "ClientMembership"("planId");
