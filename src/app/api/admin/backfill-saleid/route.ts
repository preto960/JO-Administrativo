import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-auth'

/**
 * POST /api/admin/backfill-saleid
 * One-time script to link existing memberships to their sales.
 * For memberships without saleId, finds the Sale by matching clientId + date.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if ('status' in auth) return auth

  try {
    // Find all memberships without saleId
    const memberships = await db.clientMembership.findMany({
      where: { saleId: null, paymentDate: { not: null } },
      include: { client: { select: { id: true } }, plan: { select: { name: true } } },
    })

    const results: string[] = []
    let linked = 0

    for (const m of memberships) {
      if (!m.paymentDate || !m.client) continue

      // Find matching Sale: same client, same date (within same day), no product lines (renewal sale)
      const dayStart = new Date(m.paymentDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const sale = await db.sale.findFirst({
        where: {
          clientId: m.client.id,
          date: { gte: dayStart, lt: dayEnd },
          status: 'completada',
          lines: { none: {} },  // renewal sales have no product lines
        },
        orderBy: { createdAt: 'desc' },
      })

      if (sale) {
        await db.clientMembership.update({
          where: { id: m.id },
          data: { saleId: sale.id },
        })
        linked++
        results.push(`✅ ${m.plan?.name || m.tarifa} → Sale ${sale.id.slice(0, 8)}`)
      } else {
        results.push(`⚠️ ${m.plan?.name || m.tarifa} — no matching sale found`)
      }
    }

    return NextResponse.json({
      total: memberships.length,
      linked,
      results,
    })
  } catch (error: unknown) {
    console.error('[Backfill error]', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
