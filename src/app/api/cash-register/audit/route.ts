import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cashRegId = searchParams.get('cashRegId')

    if (!cashRegId) {
      return NextResponse.json({ error: 'cashRegId es requerido' }, { status: 400 })
    }

    const audits = await db.cashAudit.findMany({
      where: { cashRegId },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { auditDate: 'desc' },
    })

    return NextResponse.json(audits)
  } catch (error) {
    return NextResponse.json({ error: 'Error al consultar arqueos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashRegId, userId, breakdown, notes } = body

    if (!cashRegId || !userId || !breakdown) {
      return NextResponse.json({ error: 'cashRegId, userId y breakdown son requeridos' }, { status: 400 })
    }

    const register = await db.cashRegister.findUnique({ where: { id: cashRegId } })
    if (!register || register.status === 'cerrada') {
      return NextResponse.json({ error: 'Caja no encontrada o cerrada' }, { status: 400 })
    }

    // Calculate counted total from denomination breakdown
    const counted = Object.entries(breakdown as Record<string, number>).reduce(
      (sum, [denomination, qty]) => sum + parseFloat(denomination) * (qty || 0),
      0
    )

    const expected = register.currentAmt
    const difference = Math.round((counted - expected) * 100) / 100

    const audit = await db.cashAudit.create({
      data: {
        cashRegId,
        userId,
        expected: Math.round(expected * 100) / 100,
        counted: Math.round(counted * 100) / 100,
        difference,
        breakdown: breakdown as object,
        notes: notes || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        cashReg: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(audit, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al registrar arqueo de caja' }, { status: 500 })
  }
}
