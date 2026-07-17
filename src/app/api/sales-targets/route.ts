import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

// GET /api/sales-targets?month=2025-06 — get targets for all users in a month
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || '' // format: "2025-06"

  try {
    const users = await db.user.findMany({
      where: { active: true, deletedAt: null, role: { in: ['admin', 'gerente', 'cajero', 'vendedor'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })

    const targets = await db.salesTarget.findMany({
      where: month ? { yearMonth: month } : {},
      select: { id: true, userId: true, yearMonth: true, targetAmount: true, dailyTargetAmount: true, applyDailyAllMonth: true },
    })

    const targetMap = new Map(targets.map(t => [`${t.userId}_${t.yearMonth}`, t]))

    return NextResponse.json({ users, targets, targetMap })
  } catch (error) {
    console.error('[SalesTargets GET]', error)
    return NextResponse.json({ error: 'Error al obtener metas' }, { status: 500 })
  }
}

// PUT /api/sales-targets — upsert targets (batch)
// Body: { targets: [{ userId, yearMonth, targetAmount, dailyTargetAmount?, applyDailyAllMonth? }] }
export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canAccessSettings) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { targets } = body as {
      targets: { userId: string; yearMonth: string; targetAmount: number; dailyTargetAmount?: number; applyDailyAllMonth?: boolean }[]
    }

    if (!targets || !Array.isArray(targets)) {
      return NextResponse.json({ error: 'targets es requerido' }, { status: 400 })
    }

    const results = []
    for (const t of targets) {
      if (t.targetAmount <= 0 && (!t.dailyTargetAmount || t.dailyTargetAmount <= 0)) {
        // Remove target if both amounts are 0 or negative
        await db.salesTarget.deleteMany({
          where: { userId: t.userId, yearMonth: t.yearMonth },
        })
        results.push({ userId: t.userId, yearMonth: t.yearMonth, deleted: true })
      } else {
        const upserted = await db.salesTarget.upsert({
          where: { userId_yearMonth: { userId: t.userId, yearMonth: t.yearMonth } },
          create: {
            userId: t.userId,
            yearMonth: t.yearMonth,
            targetAmount: t.targetAmount || 0,
            dailyTargetAmount: t.dailyTargetAmount || 0,
            applyDailyAllMonth: t.applyDailyAllMonth ?? false,
          },
          update: {
            targetAmount: t.targetAmount || 0,
            dailyTargetAmount: t.dailyTargetAmount ?? 0,
            applyDailyAllMonth: t.applyDailyAllMonth ?? false,
          },
        })
        results.push(upserted)
      }
    }

    return NextResponse.json({ message: 'Metas actualizadas', results })
  } catch (error) {
    console.error('[SalesTargets PUT]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al guardar metas' }, { status: 500 })
  }
}
