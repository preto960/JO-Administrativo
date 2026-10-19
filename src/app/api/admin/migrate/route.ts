import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-auth'

/**
 * POST /api/admin/migrate
 * One-time endpoint to apply pending migrations.
 * Admin-only. After successful run, this endpoint can be removed.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  try {
    const results: string[] = []

    // Migration 1: Add saleId to ClientMembership
    const checkSaleId = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM information_schema.columns 
      WHERE table_name = 'ClientMembership' AND column_name = 'saleId'
    `

    if (checkSaleId[0].count === BigInt(0)) {
      await db.$executeRawUnsafe(`
        ALTER TABLE "ClientMembership" ADD COLUMN "saleId" TEXT
      `)
      results.push('✅ Added saleId column to ClientMembership')

      await db.$executeRawUnsafe(`
        CREATE INDEX "ClientMembership_saleId_idx" ON "ClientMembership"("saleId")
      `)
      results.push('✅ Created index on ClientMembership.saleId')

      await db.$executeRawUnsafe(`
        ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_saleId_fkey" 
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE
      `)
      results.push('✅ Added FK constraint ClientMembership.saleId → Sale.id')
    } else {
      results.push('⏭️ saleId column already exists, skipping')
    }

    // Record migration in _prisma_migrations table
    const checkMigration = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM "_prisma_migrations" 
      WHERE "migration_name" = '20261019_add_saleid_to_membership'
    `

    if (checkMigration[0].count === BigInt(0)) {
      await db.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        VALUES (
          'mig_saleid_001',
          'manual',
          NOW(),
          '20261019_add_saleid_to_membership',
          'Applied via /api/admin/migrate',
          NULL,
          NOW(),
          1
        )
      `)
      results.push('✅ Recorded migration in _prisma_migrations')
    }

    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    console.error('[Migration error]', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
